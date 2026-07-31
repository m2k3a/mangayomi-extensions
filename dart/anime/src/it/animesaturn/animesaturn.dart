import 'package:mangayomi/bridge_lib.dart';
import 'dart:convert';

class AnimeSaturn extends MProvider {
  AnimeSaturn({required this.source});

  MSource source;

  final Client client = Client();

  String absUrl(String path) =>
      path.startsWith("http") ? path : "${source.baseUrl}$path";

  MPages parseAnimeGrid(String res) {
    List<MManga> animeList = [];

    final urls = xpath(res, '//a[@class="ac group"]/@href');
    final names = xpath(res, '//a[@class="ac group"]//h3[@class="ac__title"]/text()');
    final images = xpath(res, '//a[@class="ac group"]//img/@src');

    for (var i = 0; i < names.length; i++) {
      MManga anime = MManga();
      anime.name = formatTitle(names[i]);
      anime.imageUrl = images[i];
      anime.link = absUrl(urls[i]);
      animeList.add(anime);
    }

    final hasNextPage = xpath(res, '//a[@rel="next"]/@href').isNotEmpty;
    return MPages(animeList, hasNextPage);
  }

  @override
  Future<MPages> getPopular(int page) async {
    final path = page > 1 ? "/ongoing/$page" : "/ongoing";
    final res = (await client.get(Uri.parse(absUrl(path)))).body;
    return parseAnimeGrid(res);
  }

  @override
  Future<MPages> getLatestUpdates(int page) async {
    final path = page > 1 ? "/newest/$page" : "/newest";
    final res = (await client.get(Uri.parse(absUrl(path)))).body;
    return parseAnimeGrid(res);
  }

  @override
  Future<MPages> search(String query, int page, FilterList filterList) async {
    final filters = filterList.filters;
    final basePath = page > 1 ? "/filter/$page" : "/filter";
    String url;

    if (query.isNotEmpty) {
      url = "${absUrl(basePath)}?key=${Uri.encodeQueryComponent(query)}";
    } else {
      String qs = "";
      for (var filter in filters) {
        if (filter.type == "GenreFilter") {
          final genre = (filter.state as List).where((e) => e.state).toList();
          for (var st in genre) {
            qs += "&categories%5B%5D=${st.value}";
          }
        } else if (filter.type == "YearList") {
          final years = (filter.state as List).where((e) => e.state).toList();
          for (var st in years) {
            qs += "&years%5B%5D=${st.value}";
          }
        } else if (filter.type == "StateList") {
          final states = (filter.state as List).where((e) => e.state).toList();
          for (var st in states) {
            qs += "&states%5B%5D=${st.value}";
          }
        } else if (filter.type == "DubList") {
          final dub = filter.values[filter.state].value;
          if (dub.isNotEmpty) {
            qs += "&dub=$dub";
          }
        }
      }
      url = "${absUrl(basePath)}?${qs.replaceFirst("&", "")}";
    }

    final res = (await client.get(Uri.parse(url))).body;
    return parseAnimeGrid(res);
  }

  @override
  Future<MManga> getDetail(String url) async {
    final statusList = [
      {"In corso": 0, "Finito": 1, "Droppato": 2, "Non rilasciato": 3},
    ];

    final res = (await client.get(Uri.parse(url))).body;
    MManga anime = MManga();

    final statusText = xpath(
      res,
      '//a[starts-with(@href,"/filter?states=")]//span[contains(@class,"font-semibold")]/text()',
    );
    if (statusText.isNotEmpty) {
      anime.status = parseStatus(statusText.first, statusList);
    }

    final studio = xpath(
      res,
      '//a[starts-with(@href,"/filter?studios=")]//span[contains(@class,"font-medium")]/text()',
    );
    if (studio.isNotEmpty) {
      anime.author = studio.first;
    }

    final description = xpath(res, '//*[@class="ag-story"]/div/text()');
    anime.description = description.isNotEmpty ? description.first.trim() : "";

    anime.genre = xpath(res, '//*[@class="ag-genres chip-row mt-4"]/a/text()');

    final epUrls = xpath(res, '//a[@class="ep-tile"]/@href');
    final epTitles = xpath(res, '//a[@class="ep-tile"]/@title');

    List<MChapter>? episodesList = [];
    for (var i = 0; i < epUrls.length; i++) {
      MChapter episode = MChapter();
      episode.name = epTitles[i];
      episode.url = absUrl(epUrls[i]);
      episodesList.add(episode);
    }

    anime.chapters = episodesList.reversed.toList();
    return anime;
  }

  // AnimeSaturn's player is a small Alpine.js app: the "/episode/.../ep-N" info
  // page links to "/anime/.../ep-N", which embeds a `watchPage({...})` JSON blob
  // containing a tokenized embed link. That embed link's `/playlist` endpoint
  // returns the real video URL, XOR-obfuscated (key = the token) and base64
  // encoded, and only responds with a valid Referer header set.
  @override
  Future<List<MVideo>> getVideoList(String url) async {
    final watchUrl = url.replaceFirst("/episode/", "/anime/");
    final res = (await client.get(Uri.parse(watchUrl))).body;

    List<MVideo> videos = [];

    final match = RegExp(r'x-data="watchPage\((.+?)\)"').firstMatch(res);
    if (match == null) return videos;

    final jsonStr = match
        .group(1)!
        .replaceAll("&quot;", "\"")
        .replaceAll("&amp;", "&");

    Map<String, dynamic> data;
    try {
      data = jsonDecode(jsonStr) as Map<String, dynamic>;
    } catch (_) {
      return videos;
    }

    final servers = (data["servers"] as List?) ?? [];
    for (var server in servers) {
      final embedUrl = server["link"] as String?;
      if (embedUrl == null || embedUrl.isEmpty) continue;

      final tokenMatch = RegExp(r'token=([^&]+)').firstMatch(embedUrl);
      if (tokenMatch == null) continue;
      final token = tokenMatch.group(1)!;

      final embedParts = embedUrl.split("?");
      final playlistUrl = embedParts.length > 1
          ? "${embedParts[0]}/playlist?${embedParts[1]}"
          : "$embedUrl/playlist";

      final playlistRes = (await client.get(
        Uri.parse(playlistUrl),
        headers: {"Referer": embedUrl},
      )).body;

      Map<String, dynamic> playlistData;
      try {
        playlistData = jsonDecode(playlistRes) as Map<String, dynamic>;
      } catch (_) {
        continue;
      }

      final encoded = playlistData["d"] as String? ?? "";
      final decoded = xorDecode(encoded, token);
      if (decoded.isEmpty || decoded.startsWith("youtube/")) continue;

      if (decoded.contains(".m3u8")) {
        final masterPlaylistRes = (await client.get(Uri.parse(decoded))).body;
        for (var it in substringAfter(
          masterPlaylistRes,
          "#EXT-X-STREAM-INF:",
        ).split("#EXT-X-STREAM-INF:")) {
          if (it.trim().isEmpty) continue;
          final quality =
              "${substringBefore(substringBefore(substringAfter(substringAfter(it, "RESOLUTION="), "x"), ","), "\n")}p";

          String videoUrl = substringBefore(substringAfter(it, "\n"), "\n");

          if (!videoUrl.startsWith("http")) {
            videoUrl =
                "${decoded.split("/").sublist(0, decoded.split("/").length - 1).join("/")}/$videoUrl";
          }

          MVideo video = MVideo();
          video
            ..url = videoUrl
            ..originalUrl = videoUrl
            ..quality = quality;
          videos.add(video);
        }
      } else {
        MVideo video = MVideo();
        video
          ..url = decoded
          ..originalUrl = decoded
          ..quality = "Qualità predefinita";
        videos.add(video);
      }
    }

    return sortVideos(videos, source.id);
  }

  String xorDecode(String b64, String key) {
    if (b64.isEmpty) return "";
    final k = key.isEmpty ? "as" : key;
    try {
      final bytes = base64.decode(base64.normalize(b64));
      final out = List<int>.generate(
        bytes.length,
        (i) => bytes[i] ^ k.codeUnitAt(i % k.length),
      );
      return utf8.decode(out, allowMalformed: true);
    } catch (_) {
      return "";
    }
  }

  String formatTitle(String titlestring) {
    return titlestring
        .replaceAll("(ITA) ITA", "Dub ITA")
        .replaceAll("(ITA)", "Dub ITA")
        .replaceAll("Sub ITA", "");
  }

  @override
  List<dynamic> getFilterList() {
    return [
      HeaderFilter("Ricerca per titolo ignora i filtri e viceversa"),
      GroupFilter("GenreFilter", "Generi", [
        CheckBoxFilter("Arti Marziali", "3"),
        CheckBoxFilter("Avanguardia", "5"),
        CheckBoxFilter("Avventura", "2"),
        CheckBoxFilter("Azione", "1"),
        CheckBoxFilter("Bambini", "47"),
        CheckBoxFilter("Commedia", "4"),
        CheckBoxFilter("Demoni", "6"),
        CheckBoxFilter("Drammatico", "7"),
        CheckBoxFilter("Ecchi", "8"),
        CheckBoxFilter("Fantasy", "9"),
        CheckBoxFilter("Gioco", "10"),
        CheckBoxFilter("Harem", "11"),
        CheckBoxFilter("Hentai", "43"),
        CheckBoxFilter("Horror", "13"),
        CheckBoxFilter("Isekai", "49"),
        CheckBoxFilter("Josei", "14"),
        CheckBoxFilter("Magia", "16"),
        CheckBoxFilter("Mecha", "18"),
        CheckBoxFilter("Militari", "19"),
        CheckBoxFilter("Mistero", "21"),
        CheckBoxFilter("Musicale", "20"),
        CheckBoxFilter("Parodia", "22"),
        CheckBoxFilter("Polizia", "23"),
        CheckBoxFilter("Psicologico", "24"),
        CheckBoxFilter("Romantico", "46"),
        CheckBoxFilter("Samurai", "26"),
        CheckBoxFilter("Sci-Fi", "28"),
        CheckBoxFilter("Scolastico", "27"),
        CheckBoxFilter("Seinen", "29"),
        CheckBoxFilter("Sentimentale", "25"),
        CheckBoxFilter("Shoujo", "30"),
        CheckBoxFilter("Shoujo Ai", "31"),
        CheckBoxFilter("Shounen", "32"),
        CheckBoxFilter("Shounen Ai", "33"),
        CheckBoxFilter("Slice of Life", "34"),
        CheckBoxFilter("Soprannaturale", "37"),
        CheckBoxFilter("Spazio", "35"),
        CheckBoxFilter("Sport", "36"),
        CheckBoxFilter("Storico", "12"),
        CheckBoxFilter("Superpoteri", "38"),
        CheckBoxFilter("Thriller", "39"),
        CheckBoxFilter("Vampiri", "40"),
        CheckBoxFilter("Veicoli", "48"),
        CheckBoxFilter("Yaoi", "41"),
        CheckBoxFilter("Yuri", "42"),
      ]),
      GroupFilter("YearList", "Anno di Uscita", [
        for (var i = 2026; i >= 1967; i--)
          CheckBoxFilter(i.toString(), i.toString()),
      ]),
      GroupFilter("StateList", "Stato", [
        CheckBoxFilter("In corso", "0"),
        CheckBoxFilter("Finito", "1"),
        CheckBoxFilter("Non rilasciato", "2"),
        CheckBoxFilter("Droppato", "3"),
      ]),
      SelectFilter("DubList", "Doppiaggio", 0, [
        SelectFilterOption("Tutti", ""),
        SelectFilterOption("Doppiato", "1"),
        SelectFilterOption("Sottotitolato", "0"),
      ]),
    ];
  }

  @override
  List<dynamic> getSourcePreferences() {
    return [
      ListPreference(
        key: "preferred_quality",
        title: "Qualità preferita",
        summary: "",
        valueIndex: 0,
        entries: ["1080p", "720p", "480p", "360p", "240p", "144p"],
        entryValues: ["1080", "720", "480", "360", "240", "144"],
      ),
    ];
  }

  List<MVideo> sortVideos(List<MVideo> videos, int sourceId) {
    String quality = getPreferenceValue(sourceId, "preferred_quality");

    videos.sort((MVideo a, MVideo b) {
      int qualityMatchA = 0;
      if (a.quality.contains(quality)) {
        qualityMatchA = 1;
      }
      int qualityMatchB = 0;
      if (b.quality.contains(quality)) {
        qualityMatchB = 1;
      }
      if (qualityMatchA != qualityMatchB) {
        return qualityMatchB - qualityMatchA;
      }

      final regex = RegExp(r'(\d+)p');
      final matchA = regex.firstMatch(a.quality);
      final matchB = regex.firstMatch(b.quality);
      final int qualityNumA = int.tryParse(matchA?.group(1) ?? '0') ?? 0;
      final int qualityNumB = int.tryParse(matchB?.group(1) ?? '0') ?? 0;
      return qualityNumB - qualityNumA;
    });

    return videos;
  }
}

AnimeSaturn main(MSource source) {
  return AnimeSaturn(source: source);
}
