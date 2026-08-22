import 'package:mangayomi/bridge_lib.dart';
import 'dart:convert';

class AnimeSama extends MProvider {
  AnimeSama({required this.source});

  MSource source;

  final Client client = Client();

  @override
  String get baseUrl {
    String pref = getPreferenceValue(source.id, "base_url_pref");
    if (pref.isEmpty) pref = "https://anime-sama.to";
    if (pref.endsWith("/")) pref = pref.substring(0, pref.length - 1);
    return pref;
  }

  // ============================== Popular ===============================
  @override
  Future<MPages> getPopular(int page) async {
    final res = (await client.get(Uri.parse("$baseUrl/#$page"))).body;
    final doc = parseHtml(res);
    final elements = doc.select("#containerPepites > div a");
    List<List<MElement>> chunks = chunkedElements(elements, 5);
    List<MManga> seasons = [];
    if (page > 0 && page <= chunks.length) {
      for (var el in chunks[page - 1]) {
        final href = el.getHref;
        final animeUrl = href.startsWith("http") ? href : "$baseUrl$href";
        seasons.addAll(await fetchAnimeSeasons(animeUrl, ""));
      }
    }
    return MPages(seasons, page < chunks.length);
  }

  // =============================== Latest ===============================
  @override
  Future<MPages> getLatestUpdates(int page) async {
    final res = (await client.get(Uri.parse(baseUrl))).body;
    final doc = parseHtml(res);
    final elements = doc.select("#containerAjoutsAnimes > div");
    List<MManga> seasons = [];
    final seen = <String>{};
    for (var el in elements) {
      final a = el.selectFirst("a");
      if (a == null) continue;
      String href = a.getHref;
      if (!href.startsWith("http")) href = "$baseUrl$href";
      final uri = Uri.parse(href);
      final segments = uri.pathSegments.where((s) => s.isNotEmpty).toList();
      if (segments.length >= 3) {
        final newSegments = segments.sublist(0, segments.length - 2);
        final cleanUrl = "${uri.scheme}://${uri.host}/${newSegments.join('/')}";
        if (seen.add(cleanUrl)) {
          final resSeasons = await fetchAnimeSeasons(cleanUrl, "");
          seasons.addAll(resSeasons);
        }
      } else {
        if (seen.add(href)) {
          final resSeasons = await fetchAnimeSeasons(href, "");
          seasons.addAll(resSeasons);
        }
      }
    }
    return MPages(seasons, false);
  }

  // =============================== Search ===============================
  @override
  Future<MPages> search(String query, int page, FilterList filterList) async {
    final queryTrimmed = query.trim();
    if (queryTrimmed.startsWith("https://")) {
      final seasons = await fetchAnimeSeasons(queryTrimmed, "");
      return MPages(seasons, false);
    } else if (queryTrimmed.startsWith("id:")) {
      final id = queryTrimmed.substring(3);
      final animeUrl = id.startsWith("/") ? "$baseUrl$id" : "$baseUrl/$id";
      final seasons = await fetchAnimeSeasons(animeUrl, "");
      return MPages(seasons, false);
    }

    final queryParams = <String, String>{
      "search": queryTrimmed,
      "page": "$page",
    };

    final filters = filterList.filters;
    for (var filter in filters) {
      if (filter.type == "TypeFilter") {
        final types = (filter.state as List).where((e) => e.state).toList();
        if (types.isNotEmpty) {
          queryParams["type[]"] = types.map((e) => e.value).join(",");
        }
      } else if (filter.type == "LanguageFilter") {
        final language = (filter.state as List).where((e) => e.state).toList();
        if (language.isNotEmpty) {
          queryParams["langue[]"] = language.map((e) => e.value).join(",");
        }
      } else if (filter.type == "GenreFilter") {
        final genres = (filter.state as List).where((e) => e.state == 1).toList();
        if (genres.isNotEmpty) {
          queryParams["genre[]"] = genres.map((e) => e.value).join(",");
        }
      }
    }

    final url = Uri.parse("$baseUrl/catalogue/").replace(queryParameters: queryParams);
    final res = (await client.get(url)).body;
    final doc = parseHtml(res);
    final elements = doc.select("#list_catalog > div a");
    List<MManga> seasons = [];
    for (var el in elements) {
      String href = el.getHref;
      if (!href.startsWith("http")) href = "$baseUrl$href";
      seasons.addAll(await fetchAnimeSeasons(href, ""));
    }
    final lastPageEl = doc.selectFirst("#list_pagination a:last-child");
    final lastPage = lastPageEl?.text.trim() ?? "";
    final hasNextPage = lastPage.isNotEmpty && lastPage != "$page";
    return MPages(seasons, hasNextPage);
  }

  // =========================== Anime Details ============================
  @override
  Future<MManga> getDetail(String url) async {
    String cleanUrl = url;
    if (cleanUrl.endsWith("/")) cleanUrl = cleanUrl.substring(0, cleanUrl.length - 1);
    final movieIdx = cleanUrl.contains("#") ? int.tryParse(cleanUrl.split("#").last) : null;
    final targetUrl = cleanUrl.split("#").first;
    final segments = targetUrl.replaceAll(baseUrl, "").split("/").where((s) => s.isNotEmpty).toList();
    final animeUrl = "$baseUrl/${segments.take(2).join('/')}/";
    final season = segments.length > 2 ? segments[2] : "";

    final seasons = await fetchAnimeSeasons(animeUrl, season);
    MManga anime;
    if (seasons.isNotEmpty) {
      if (movieIdx != null && movieIdx < seasons.length) {
        anime = seasons[movieIdx];
      } else {
        anime = seasons.first;
      }
    } else {
      anime = MManga();
      anime.link = url;
    }

    final currentFolder = targetUrl.split("/").last;
    final isVoiceFolder = voicesValues.contains(currentFolder);
    final parentUrl = isVoiceFolder
        ? targetUrl.substring(0, targetUrl.lastIndexOf("/"))
        : targetUrl;

    final paths = ([currentFolder] + voicesValues).toSet().toList();
    final List<List<List<String>>> allVoicePlayers = [];
    final List<String> availableVoiceNames = [];

    for (var path in paths) {
      final pList = await fetchPlayers("$parentUrl/$path");
      if (pList.isNotEmpty) {
        allVoicePlayers.add(pList);
        availableVoiceNames.add(path);
      }
    }

    anime.chapters = playersToEpisodes(allVoicePlayers, availableVoiceNames);
    return anime;
  }

  // ============================ Episodes helper =============================
  List<MChapter> playersToEpisodes(List<List<List<String>>> voiceList, List<String> voiceNames) {
    int maxEps = 0;
    for (var voice in voiceList) {
      for (var player in voice) {
        if (player.length > maxEps) maxEps = player.length;
      }
    }

    List<MChapter> chapters = [];
    for (int i = 0; i < maxEps; i++) {
      final episodeVoices = <List<String>>[];
      final activeVoices = <String>[];

      for (int v = 0; v < voiceList.length; v++) {
        final players = <String>[];
        for (var player in voiceList[v]) {
          if (i < player.length && player[i].isNotEmpty) {
            players.add(player[i]);
          }
        }
        if (players.isNotEmpty) {
          episodeVoices.add(players);
          activeVoices.add(voiceNames[v]);
        }
      }

      var ep = MChapter();
      ep.name = "Episode ${i + 1}";
      ep.url = jsonEncode(episodeVoices);
      ep.scanlator = activeVoices.join(", ").toUpperCase();
      chapters.add(ep);
    }
    return chapters.reversed.toList();
  }

  Future<List<List<String>>> fetchPlayers(String url) async {
    String cleanUrl = url;
    while (cleanUrl.endsWith("/")) {
      cleanUrl = cleanUrl.substring(0, cleanUrl.length - 1);
    }
    final docUrl = "$cleanUrl/episodes.js";
    try {
      final res = (await client.get(Uri.parse(docUrl))).body;
      if (res.isEmpty || !res.contains("eps")) return [];

      final List<List<String>> playerList = [];
      final regVar = RegExp(r"(?:var|let|const)?\s*(eps\w*)\s*=\s*\[(.*?)\];", dotAll: true);
      for (var match in regVar.allMatches(res)) {
        final rawArray = match.group(2) ?? "";
        final regUrl = RegExp(r"['\x22](https?://[^'\x22\s]+)['\x22]");
        final urls = regUrl.allMatches(rawArray).map((m) => m.group(1)!).toList();
        if (urls.isNotEmpty) {
          playerList.add(urls);
        }
      }
      return playerList;
    } catch (_) {
      return [];
    }
  }

  // ============================ Video Extractor =============================
  @override
  Future<List<MVideo>> getVideoList(String url) async {
    List<dynamic> voiceGroups;
    try {
      voiceGroups = jsonDecode(url);
    } catch (_) {
      voiceGroups = [];
    }

    final List<MVideo> videos = [];

    for (int groupIdx = 0; groupIdx < voiceGroups.length; groupIdx++) {
      final group = voiceGroups[groupIdx];
      if (group is List) {
        for (var item in group) {
          if (item is String && item.isNotEmpty) {
            try {
              if (item.contains("sibnet.ru")) {
                videos.addAll(await sibnetExtractor(item, ""));
              } else if (item.contains("vidmoly") || item.contains("ansembed")) {
                videos.addAll(await vidmolyExtractor(item, ""));
              } else if (item.contains("sendvid.com")) {
                videos.addAll(await sendvidExtractor(item, ""));
              } else if (vidhideDomains.any((d) => item.toLowerCase().contains(d))) {
                videos.addAll(await vidhideExtractor(item, "VidHide"));
              } else if (item.contains("vk.com") || item.contains("vkvideo")) {
                videos.addAll(await vkExtractor(item, ""));
              } else if (item.contains("uqload")) {
                videos.addAll(await uqloadExtractor(item, ""));
              } else if (item.contains("yourupload")) {
                videos.addAll(await youruploadExtractor(item, ""));
              } else if (item.contains(".mp4")) {
                var v = MVideo();
                v..url = item
                 ..originalUrl = item
                 ..quality = "Direct MP4"
                 ..headers = {"Referer": baseUrl, "User-Agent": "Mozilla/5.0"};
                videos.add(v);
              }
            } catch (_) {}
          }
        }
      }
    }

    // Deduplicate by URL
    final seenUrls = <String>{};
    final uniqueVideos = <MVideo>[];
    for (var v in videos) {
      if (seenUrls.add(v.url.split("?").first)) {
        uniqueVideos.add(v);
      }
    }

    return sortVideos(uniqueVideos, source.id);
  }

  // ============================ Specific Extractors =============================
  // 1. Sibnet Extractor (matches aniyomi.lib.sibnetextractor.SibnetExtractor)
  Future<List<MVideo>> sibnetExtractor(String url, String prefix) async {
    final res = (await client.get(Uri.parse(url), headers: {"Referer": baseUrl})).body;
    final scriptMatch = RegExp(r"""player\.src\s*:\s*\[\s*\{\s*src\s*:\s*["\x27]([^"\x27]+)["\x27]""").firstMatch(res);
    String slug = "";
    if (scriptMatch != null) {
      slug = scriptMatch.group(1)!;
    } else {
      final fallbackMatch = RegExp(r"""["\x27](/(?:v|shell)/[^"\x27]+\.mp4)["\x27]""").firstMatch(res);
      if (fallbackMatch != null) slug = fallbackMatch.group(1)!;
    }
    if (slug.isEmpty) return [];

    final videoUrl = slug.startsWith("http") ? slug : "https://${Uri.parse(url).host}$slug";
    var v = MVideo();
    v..url = videoUrl
     ..originalUrl = videoUrl
     ..quality = "${prefix}Sibnet"
     ..headers = {"Referer": url, "User-Agent": "Mozilla/5.0"};
    return [v];
  }

  // 2. VidMoly Extractor (matches aniyomi.lib.vidmolyextractor.VidMolyExtractor)
  Future<List<MVideo>> vidmolyExtractor(String url, String prefix) async {
    const vidmolyBase = "https://vidmoly.biz";
    final fixedUrl = url.startsWith(vidmolyBase)
        ? url
        : url.replaceFirst(RegExp(r"^https?://(?:www\.)?[^/]+/"), "$vidmolyBase/");

    final headers = {
      "Origin": vidmolyBase,
      "Referer": "$vidmolyBase/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    };

    final res = (await client.get(Uri.parse(fixedUrl), headers: headers)).body;
    final fileMatch = RegExp(r"""file\s*:\s*["\x27](https?://[^"\x27]+\.m3u8[^"\x27]*)["\x27]""").firstMatch(res);
    if (fileMatch != null) {
      final m3u8Url = fileMatch.group(1)!;
      var v = MVideo();
      v..url = m3u8Url
       ..originalUrl = m3u8Url
       ..quality = "${prefix}VidMoly - 1080p"
       ..headers = headers;
      return [v];
    }
    return [];
  }

  // 3. Sendvid Extractor (matches aniyomi.lib.sendvidextractor.SendvidExtractor)
  Future<List<MVideo>> sendvidExtractor(String url, String prefix) async {
    final res = (await client.get(Uri.parse(url))).body;
    final doc = parseHtml(res);
    final masterUrl = doc.selectFirst("source#video_source")?.attr("src");
    if (masterUrl == null || masterUrl.isEmpty) return [];

    final origin = "https://${Uri.parse(url).host}";
    final headers = {"Origin": origin, "Referer": "$origin/"};

    if (masterUrl.contains(".m3u8")) {
      List<MVideo> vids = [];
      try {
        final playlist = (await client.get(Uri.parse(masterUrl), headers: headers)).body;
        for (var it in substringAfter(playlist, "#EXT-X-STREAM-INF:").split("#EXT-X-STREAM-INF:")) {
          final resMatch = RegExp(r"RESOLUTION=\d+x(\d+)").firstMatch(it);
          final quality = resMatch != null ? "${resMatch.group(1)}p" : "720p";
          String videoUrl = substringBefore(substringAfter(it, "\n"), "\n").trim();
          if (!videoUrl.startsWith("http")) {
            videoUrl = "${masterUrl.substring(0, masterUrl.lastIndexOf('/'))}/$videoUrl";
          }
          var v = MVideo();
          v..url = videoUrl
           ..originalUrl = videoUrl
           ..quality = "${prefix}Sendvid:$quality"
           ..headers = headers;
          vids.add(v);
        }
      } catch (_) {}
      if (vids.isNotEmpty) return vids;
    }

    var v = MVideo();
    v..url = masterUrl
     ..originalUrl = masterUrl
     ..quality = "${prefix}Sendvid:default"
     ..headers = headers;
    return [v];
  }

  // 4. VidHide Extractor (matches aniyomi.lib.vidhideextractor.VidHideExtractor)
  Future<List<MVideo>> vidhideExtractor(String url, String prefix) async {
    final headers = {
      "Referer": url,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    };
    final res = (await client.get(Uri.parse(url), headers: headers)).body;
    
    // Look for m3u8 in unpacked or raw html
    final match = RegExp(r"""["\x27]((?:https?:/)?/[^"\x27]*m3u8[^"\x27]*)["\x27]""").firstMatch(res);
    if (match != null) {
      String m3u8Url = match.group(1)!;
      if (!m3u8Url.startsWith("http")) {
        final uri = Uri.parse(url);
        m3u8Url = "${uri.scheme}://${uri.host}$m3u8Url";
      }
      var v = MVideo();
      v..url = m3u8Url
       ..originalUrl = m3u8Url
       ..quality = "${prefix}VidHide - 1080p"
       ..headers = headers;
      return [v];
    }
    return [];
  }

  // 5. VK Extractor (matches aniyomi.lib.vkextractor.VkExtractor)
  Future<List<MVideo>> vkExtractor(String url, String prefix) async {
    const vkUrl = "https://vk.com";
    final headers = {
      "Accept": "video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5",
      "Origin": vkUrl,
      "Referer": "$vkUrl/",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    };

    final res = (await client.get(Uri.parse(url), headers: headers)).body;
    List<MVideo> vids = [];
    for (var m in RegExp(r"""url(\d+)["\x27]:\s*["\x27](https?://[^"\x27]+)["\x27]""").allMatches(res)) {
      final q = m.group(1);
      final u = m.group(2)!.replaceAll(r"\/", "/");
      var v = MVideo();
      v..url = u
       ..originalUrl = u
       ..quality = "${prefix}VK ${q}p"
       ..headers = headers;
      vids.add(v);
    }
    return vids;
  }

  // 6. Uqload Extractor (matches aniyomi.lib.uqloadextractor.UqloadExtractor)
  Future<List<MVideo>> uqloadExtractor(String url, String prefix) async {
    const uqloadBase = "https://uqload.is/";
    final fixedUrl = url.startsWith(uqloadBase)
        ? url
        : url.replaceFirst(RegExp(r"https?://(?:www\.)?[^/]+/"), uqloadBase);

    final headers = {"Referer": fixedUrl, "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"};
    final res = (await client.get(Uri.parse(fixedUrl), headers: headers)).body;
    
    final match = RegExp(r"""sources\s*:\s*\[\s*["\x27](https?://[^"\x27]+)["\x27]\s*\]""").firstMatch(res);
    if (match != null) {
      final streamUrl = match.group(1)!;
      var v = MVideo();
      v..url = streamUrl
       ..originalUrl = streamUrl
       ..quality = "${prefix}Uqload"
       ..headers = headers;
      return [v];
    }
    return [];
  }

  // 7. YourUpload Extractor (matches aniyomi.lib.youruploadextractor.YourUploadExtractor)
  Future<List<MVideo>> youruploadExtractor(String url, String prefix) async {
    final headers = {"Referer": "https://www.yourupload.com/", "User-Agent": "Mozilla/5.0"};
    final res = (await client.get(Uri.parse(url), headers: headers)).body;
    final match = RegExp(r"""file\s*:\s*["\x27](https?://[^"\x27]+\.mp4[^"\x27]*)["\x27]""").firstMatch(res);
    if (match != null) {
      final videoUrl = match.group(1)!;
      var v = MVideo();
      v..url = videoUrl
       ..originalUrl = videoUrl
       ..quality = "${prefix}YourUpload"
       ..headers = headers;
      return [v];
    }
    return [];
  }

  // ============================ Anime seasons parser =============================
  Future<List<MManga>> fetchAnimeSeasons(String animeUrl, String targetSeason) async {
    String cleanAnimeUrl = animeUrl;
    while (cleanAnimeUrl.endsWith("/")) {
      cleanAnimeUrl = cleanAnimeUrl.substring(0, cleanAnimeUrl.length - 1);
    }
    final res = (await client.get(Uri.parse(cleanAnimeUrl))).body;
    final doc = parseHtml(res);
    final animeName = doc.selectFirst("h1")?.text.trim() ?? "";

    final statusText = doc.selectFirst(".info-lbl:contains(État) + .info-val")?.text.trim() ?? "";
    int animeStatus = 5;
    if (statusText.toLowerCase().contains("en cours")) {
      animeStatus = 0;
    } else if (statusText.toLowerCase().contains("terminé")) {
      animeStatus = 1;
    }

    final thumbnailUrl = doc.getElementById("coverOeuvre")?.attr("abs:src") ??
        doc.selectFirst("meta[property=og:image]")?.attr("content") ??
        doc.selectFirst("meta[itemprop=image]")?.attr("content") ??
        "";

    final descriptionText = doc.selectFirst("#synopsisText")?.text.trim() ?? "";
    final genres = doc.select(".genre-pill").map((g) => g.text.trim()).where((g) => g.isNotEmpty).toList();

    final scripts = doc.select("script").map((e) => e.text).join("\n");
    final uncommented = scripts.replaceAll(RegExp(r"/\*.*?\*/", dotAll: true), "");

    final seasonRegex = RegExp(r"""panneauAnime\(\s*["\x27](.*?)["\x27]\s*,\s*["\x27](.*?)["\x27]\s*\)""");
    final matches = seasonRegex.allMatches(uncommented).toList();

    List<MManga> animeList = [];

    for (int idx = 0; idx < matches.length; idx++) {
      final seasonName = matches[idx].group(1) ?? "";
      final seasonStem = matches[idx].group(2) ?? "";
      final stemSeason = seasonStem.split("/").first;

      if (targetSeason.isNotEmpty && stemSeason != targetSeason) {
        continue;
      }

      if (seasonStem.toLowerCase().contains("film")) {
        final moviesUrl = "$cleanAnimeUrl/$seasonStem";
        final moviePlayers = await fetchPlayers(moviesUrl);
        if (moviePlayers.isNotEmpty) {
          final movieMatches = RegExp(r"""newSPF\(\s*["\x27](.*?)["\x27]\s*\);""").allMatches(res).toList();
          for (int m = 0; m < moviePlayers.length; m++) {
            String title = (movieMatches.length > m)
                ? "$animeName ${movieMatches[m].group(1)}"
                : (moviePlayers.length == 1 ? "$animeName Film" : "$animeName Film ${m + 1}");
            var mAnime = MManga();
            mAnime..name = title
                  ..imageUrl = thumbnailUrl
                  ..description = descriptionText
                  ..genre = genres
                  ..status = animeStatus
                  ..link = "$moviesUrl#$m";
            animeList.add(mAnime);
          }
        }
      } else {
        String displaySeason = stemSeason.startsWith("saison")
            ? "Saison ${stemSeason.replaceFirst('saison', '')}"
            : seasonName.split(" (").first;
        var sAnime = MManga();
        sAnime..name = "$animeName $displaySeason".trim()
              ..imageUrl = thumbnailUrl
              ..description = descriptionText
              ..genre = genres
              ..status = animeStatus
              ..link = "$cleanAnimeUrl/$seasonStem";
        animeList.add(sAnime);
      }
    }

    if (animeList.isEmpty && animeName.isNotEmpty) {
      var single = MManga();
      single..name = animeName
            ..imageUrl = thumbnailUrl
            ..description = descriptionText
            ..genre = genres
            ..status = animeStatus
            ..link = cleanAnimeUrl;
      animeList.add(single);
    }

    return animeList;
  }

  // ============================ Utilities =============================
  List<List<MElement>> chunkedElements(List<MElement> list, int size) {
    List<List<MElement>> chunks = [];
    for (int i = 0; i < list.length; i += size) {
      int end = (i + size < list.length) ? i + size : list.length;
      chunks.add(list.sublist(i, end));
    }
    return chunks;
  }

  List<MVideo> sortVideos(List<MVideo> videos, int sourceId) {
    String quality = getPreferenceValue(sourceId, "preferred_quality");
    String voice = getPreferenceValue(sourceId, "voices_preference");
    String player = getPreferenceValue(sourceId, "player_preference");

    videos.sort((MVideo a, MVideo b) {
      int scoreA = 0;
      int scoreB = 0;

      if (a.quality.toLowerCase().contains(voice)) scoreA += 4;
      if (b.quality.toLowerCase().contains(voice)) scoreB += 4;

      if (a.quality.toLowerCase().contains(player.toLowerCase())) scoreA += 2;
      if (b.quality.toLowerCase().contains(player.toLowerCase())) scoreB += 2;

      if (a.quality.contains(quality)) scoreA += 1;
      if (b.quality.contains(quality)) scoreB += 1;

      return scoreB - scoreA;
    });
    return videos;
  }

  // ============================ Preferences & Filters =============================
  static const List<String> voicesValues = [
    "vostfr", "vf", "vf1", "vf2", "va", "var", "vcn", "vj", "vkr", "vqc"
  ];

  static const List<String> vidhideDomains = [
    "smoothpre", "movearnpre", "minochinos", "morencius", "vidhide"
  ];

  @override
  List<dynamic> getSourcePreferences() {
    return [
      EditTextPreference(
        key: "base_url_pref",
        title: "URL de base",
        summary: "Pour changer le domaine de l'extension (par ex: https://anime-sama.to, https://anime-sama.pw)",
        value: "https://anime-sama.to",
        dialogTitle: "Remplacer BaseUrl",
        dialogMessage: "",
        text: "https://anime-sama.to",
      ),
      ListPreference(
        key: "preferred_quality",
        title: "Qualité préférée",
        summary: "",
        valueIndex: 0,
        entries: ["1080p", "720p", "480p", "360p"],
        entryValues: ["1080", "720", "480", "360"],
      ),
      ListPreference(
        key: "voices_preference",
        title: "Préférence des voix",
        summary: "",
        valueIndex: 0,
        entries: [
          "Préférer VOSTFR", "Préférer VF", "Préférer VF1", "Préférer VF2",
          "Préférer VA", "Préférer VAR", "Préférer VCN", "Préférer VJ",
          "Préférer VKR", "Préférer VQC"
        ],
        entryValues: [
          "vostfr", "vf", "vf1", "vf2",
          "va", "var", "vcn", "vj",
          "vkr", "vqc"
        ],
      ),
      ListPreference(
        key: "player_preference",
        title: "Lecteur par défaut",
        summary: "",
        valueIndex: 0,
        entries: [
          "Sibnet", "Sendvid", "VidMoly", "VidHide",
          "VK", "Uqload", "YourUpload", "Direct MP4"
        ],
        entryValues: [
          "sibnet", "sendvid", "vidmoly", "vidhide",
          "vk", "uqload", "yourupload", "direct"
        ],
      ),
    ];
  }

  @override
  List<dynamic> getFilterList() {
    return [
      SelectFilter("TypeFilter", "Type", 0, [
        SelectFilterOption("Tous", ""),
        SelectFilterOption("Anime", "Anime"),
        SelectFilterOption("Film", "Film"),
      ]),
      SelectFilter("LanguageFilter", "Langue", 0, [
        SelectFilterOption("Toutes", ""),
        SelectFilterOption("VOSTFR", "vostfr"),
        SelectFilterOption("VF", "vf"),
      ]),
    ];
  }
}

AnimeSama main(MSource source) {
  return AnimeSama(source: source);
}
