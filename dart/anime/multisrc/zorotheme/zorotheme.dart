import 'package:mangayomi/bridge_lib.dart';
import 'dart:convert';

class URLS {
  static String serverTypesPath(String sourceName) {
    if (sourceName == "HiAnime") return "/ajax/v2/episode/servers?episodeId=";
    return "/ajax/episode/servers?episodeId=";
  }

  static String streamDataPath1(String sourceName) {
    if (sourceName == "HiAnime") return "/ajax/v2/episode/sources?id=";
    return "/ajax/episode/sources?id=";
  }

  static String streamDataPath2(String sourceName, String id) {
    if (sourceName == "HiAnime")
      return "https://megacloud.blog/embed-2/v3/e-1/$id?k=1&autoPlay=1&oa=0&asi=1";
    return "https://rapid-cloud.co/embed-2/v2/e-1/getSources?id=$id";
  }
}

class ZoroTheme extends MProvider {
  ZoroTheme({required this.source});

  MSource source;

  final Client client = Client();

  @override
  Future<MPages> getPopular(int page) async {
    final res = (await client.get(
      Uri.parse("${source.baseUrl}/most-popular?page=$page"),
    )).body;

    return animeElementM(res);
  }

  @override
  Future<MPages> getLatestUpdates(int page) async {
    final res = (await client.get(
      Uri.parse("${source.baseUrl}/recently-updated?page=$page"),
    )).body;

    return animeElementM(res);
  }

  @override
  Future<MPages> search(String query, int page, FilterList filterList) async {
    final filters = filterList.filters;
    String url = "${source.baseUrl}/";

    if (query.isEmpty) {
      url += "filter?";
    } else {
      url += "search?keyword=$query";
    }

    for (var filter in filters) {
      if (filter.type == "TypeFilter") {
        final type = filter.values[filter.state].value;
        if (type.isNotEmpty) {
          url += "${ll(url)}type=$type";
        }
      } else if (filter.type == "StatusFilter") {
        final status = filter.values[filter.state].value;
        if (status.isNotEmpty) {
          url += "${ll(url)}status=$status";
        }
      } else if (filter.type == "RatedFilter") {
        final rated = filter.values[filter.state].value;
        if (rated.isNotEmpty) {
          url += "${ll(url)}rated=$rated";
        }
      } else if (filter.type == "ScoreFilter") {
        final score = filter.values[filter.state].value;
        if (score.isNotEmpty) {
          url += "${ll(url)}score=$score";
        }
      } else if (filter.type == "SeasonFilter") {
        final season = filter.values[filter.state].value;
        if (season.isNotEmpty) {
          url += "${ll(url)}season=$season";
        }
      } else if (filter.type == "LanguageFilter") {
        final language = filter.values[filter.state].value;
        if (language.isNotEmpty) {
          url += "${ll(url)}language=$language";
        }
      } else if (filter.type == "SortFilter") {
        final sort = filter.values[filter.state].value;
        if (sort.isNotEmpty) {
          url += "${ll(url)}sort=$sort";
        }
      } else if (filter.type == "StartYearFilter") {
        final sy = filter.values[filter.state].value;
        if (sy.isNotEmpty) {
          url += "${ll(url)}sy=$sy";
        }
      } else if (filter.type == "StartMonthFilter") {
        final sm = filter.values[filter.state].value;
        if (sm.isNotEmpty) {
          url += "${ll(url)}sm=$sm";
        }
      } else if (filter.type == "StartDayFilter") {
        final sd = filter.values[filter.state].value;
        if (sd.isNotEmpty) {
          url += "${ll(url)}sd=$sd";
        }
      } else if (filter.type == "EndYearFilter") {
        final ey = filter.values[filter.state].value;
        if (ey.isNotEmpty) {
          url += "${ll(url)}sy=$ey";
        }
      } else if (filter.type == "EndMonthFilter") {
        final em = filter.values[filter.state].value;
        if (em.isNotEmpty) {
          url += "${ll(url)}sm=$em";
        }
      } else if (filter.type == "EndDayFilter") {
        final ed = filter.values[filter.state].value;
        if (ed.isNotEmpty) {
          url += "${ll(url)}sd=$ed";
        }
      } else if (filter.type == "GenreFilter") {
        final genre = (filter.state as List).where((e) => e.state).toList();
        if (genre.isNotEmpty) {
          url += "${ll(url)}genre=";
          for (var st in genre) {
            url += "${st.value},";
          }
        }
      }
    }
    url += "${ll(url)}page=$page";
    final res = (await client.get(Uri.parse(url))).body;

    return animeElementM(res);
  }

  @override
  Future<MManga> getDetail(String url) async {
    final statusList = [
      {"Currently Airing": 0, "Finished Airing": 1},
    ];
    final res = (await client.get(Uri.parse("${source.baseUrl}$url"))).body;
    MManga anime = MManga();
    final status =
        xpath(
          res,
          '//*[@class="anisc-info"]/div[contains(text(),"Status:")]/span[2]/text()',
        ) ??
        [];
    if (status.isNotEmpty) {
      anime.status = parseStatus(status.first, statusList);
    }

    final author =
        xpath(
          res,
          '//*[@class="anisc-info"]/div[contains(text(),"Studios:")]/span/text()',
        ) ??
        [];
    if (author.isNotEmpty) {
      anime.author = author.first.replaceAll("Studios:", "");
    }
    final description =
        xpath(
          res,
          '//*[@class="anisc-info"]/div[contains(text(),"Overview:")]/text()',
        ) ??
        [];
    if (description.isNotEmpty) {
      anime.description = description.first.replaceAll("Overview:", "");
    }
    final genre = xpath(
      res,
      '//*[@class="anisc-info"]/div[contains(text(),"Genres:")]/a/text()',
    );

    anime.genre = genre;
    final id = substringAfterLast(url, '-');

    final urlEp =
        "${source.baseUrl}/ajax${ajaxRoute('${source.baseUrl}')}/episode/list/$id";

    final resEp = (await client.get(
      Uri.parse(urlEp),
      headers: {"referer": url},
    )).body;

    final html = json.decode(resEp)["html"];
    final epElements = parseHtml(html).select("a.ep-item");
    epElements.sort((b, a) {
      final numA = int.tryParse(a.attr("data-number")) ?? 0;
      final numB = int.tryParse(b.attr("data-number")) ?? 0;
      return numA.compareTo(numB);
    });
    List<MChapter>? episodesList = [];

    for (var epElement in epElements) {
      final number = epElement.attr("data-number");
      final title = epElement.attr("title");

      MChapter episode = MChapter();
      episode.name = "Episode $number: $title";
      episode.url = epElement.getHref;
      episodesList.add(episode);
    }
    anime.chapters = episodesList;
    return anime;
  }

  @override
  Future<List<Video>> getVideoList(String url) async {
    List<String> episodeIdentifiers = substringAfterLast(
      url,
      '/watch/',
    ).split("?ep=");
    String id = episodeIdentifiers[0];
    String epId = episodeIdentifiers.length > 1 ? episodeIdentifiers[1] : "";
    List<Video> videos = [];

    final serverTypes = await getVideoServerTypes(id, epId);
    for (String type in preferenceTypeSelection()) {
      for (String hoster in preferenceHosterSelection()) {
        List<MVideo>? videoRes = await getVideoServers(
          type,
          hoster,
          serverTypes[type]?[hoster] ?? [],
        );
        if (videoRes != null) videos.addAll(videoRes);
      }
    }
    return sortVideos(videos);
  }

  /// Example \
  /// `{'sub': {'HD-1': ['642952', '4'], ...}, 'dub': {...}, 'raw': {...}}`
  Future<Map<String, Map<String, List<String>>>> getVideoServerTypes(
    String id,
    String episodeId,
  ) async {
    Map<String, Map<String, List<String>>> serverTypes = {};
    MDocument doc = parseHtml(
      jsonDecode(
        (await client.get(
          Uri.parse(
            "${source.baseUrl}${URLS.serverTypesPath(source.name ?? "")}$episodeId",
          ),
          headers: {"referer": "${source.baseUrl}/watch/$id?ep=$episodeId"},
        )).body,
      )['html'],
    );
    doc.select("div.ps__-list > div").forEach((element) {
      final type = element.attr("data-type"); // e.g. sub, dub, raw
      final dataId = element.attr("data-id"); // e.g. 642952
      final dataServerId = element.attr("data-server-id"); // e.g. 4
      final serverName = element.text.trim(); // e.g. HD-1, HD-2, HD-3
      if (!serverTypes.containsKey(type)) serverTypes[type] = {};
      if (!serverTypes[type]!.containsKey(serverName))
        serverTypes[type]![serverName] = [];
      serverTypes[type]![serverName]?.addAll([dataId, dataServerId]);
    });
    return serverTypes;
  }

  String getKeyFromLine(String line) {
    RegExp allPartsRegex = RegExp(
      r"([A-Za-z0-9]{16}).*?([A-Za-z0-9]{16}).*?([A-Za-z0-9]{16})",
    );
    RegExp onePartRegex = RegExp(r"([A-Za-z0-9]{16})");
    line = allPartsRegex.stringMatch(line) ?? "";
    List<String> keys = [];
    while (onePartRegex.hasMatch(line)) {
      try {
        String? part = onePartRegex.stringMatch(line);
        keys.add(part ?? "");
        line = line.replaceFirst(onePartRegex, "");
      } catch (_) {
        break;
      }
    }
    return keys.join("");
  }

  /// ### return keys usually are
  /// `sources` -> [List] of [Map]s with keys `file` and `type` \
  /// `tracks` -> [List] of [Map]s with keys `file`, `kind`, and sometimes `label`, `default`\
  /// `encrypted` -> [bool] value\
  /// `intro` -> `start` and `end` keys with [int] values in seconds\
  /// `outro` -> `start` and `end` keys with [int] values in seconds\
  /// `server` -> [String] value of the server name e.g. 4.
  Future<Map<String, dynamic>> getStreamData(String dataId) async {
    Map<String, dynamic> resJson = jsonDecode(
      (await client.get(
        Uri.parse(
          "${source.baseUrl}${URLS.streamDataPath1(source.name ?? "")}$dataId",
        ),
        headers: {"referer": "${source.baseUrl}"},
      )).body,
    );
    String id = substringBefore(
      substringAfter(resJson['link'] ?? "", "e-1/"),
      "?",
    );
    String line = (await client.get(
      Uri.parse(URLS.streamDataPath2(source.name ?? "", id)),
      headers: {"referer": "${source.baseUrl}"},
    )).body;
    try {
      final test = jsonDecode(line);
      if (test is Map<String, dynamic> && test.containsKey("sources")) {
        return test;
      }
    } catch (e) {}
    line = substringAfter(line, "</script>\n    ");
    line = substringBefore(line, "</head>");
    String key = getKeyFromLine(line);
    if (key.isEmpty)
      throw Exception(
        "Important line not found or regex did not match. in func: getStreamLink",
      );
    final dede = jsonDecode(
      (await client.get(
        Uri.parse(
          "https://megacloud.blog/embed-2/v3/e-1/getSources?id=$id&_k=$key",
        ),
        headers: {
          "referer":
              "https://megacloud.blog/embed-2/v3/e-1/$id?k=1&autoPlay=1&oa=0&asi=1",
        },
      )).body,
    );
    return dede;
  }

  Future<List<MVideo>?> getVideoServers(
    String subDubType,
    String serverName,
    List<String> dataList,
  ) async {
    final heheaders = {'Referer': 'https://megacloud.blog/'};
    final name = "$serverName - $subDubType";

    // dataList[0] is dataId
    if (dataList.isEmpty) return null;
    Map<String, dynamic> sData = await getStreamData(dataList[0]);

    List<Track> subtitles = [];
    (sData['tracks'] ?? []).forEach((track) {
      if (track['kind'] == 'subtitles' || track['kind'] == 'captions') {
        subtitles.add(
          MTrack(file: track['file'] ?? track['link'], label: track['label']),
        );
      }
    });
    List<MVideo> videos = [];
    final sources = sData['sources'] as List<dynamic>?;
    if (sources != null && sources.isNotEmpty) {
      final masterUrl = sources[0]['file'] as String;
      final type = sources[0]['type'] as String?;
      if (type == "hls") {
        final masterPlaylistRes = (await client.get(
          Uri.parse(masterUrl),
          headers: heheaders,
        )).body;

        for (var it in substringAfter(
          masterPlaylistRes,
          "#EXT-X-STREAM-INF:",
        ).split("#EXT-X-STREAM-INF:")) {
          final quality =
              "${substringBefore(substringBefore(substringAfter(substringAfter(it, "RESOLUTION="), "x"), ","), "\n")}p";

          String videoUrl = substringBefore(substringAfter(it, "\n"), "\n");

          if (!videoUrl.startsWith("http")) {
            videoUrl =
                "${masterUrl.split("/").sublist(0, masterUrl.split("/").length - 1).join("/")}/$videoUrl";
          }

          MVideo video = MVideo();
          video
            ..url = videoUrl
            ..originalUrl = videoUrl
            ..quality = "$name - $quality"
            ..headers = heheaders
            ..subtitles = subtitles;
          videos.add(video);
        }
      } else {
        MVideo video = MVideo();
        video
          ..url = masterUrl
          ..originalUrl = masterUrl
          ..quality = "$name - Default"
          ..headers = heheaders
          ..subtitles = subtitles;
        videos.add(video);
      }
    }

    return videos;
  }

  MPages animeElementM(String res) {
    List<MManga> animeList = [];
    final doc = parseHtml(res);
    final animeElements = doc.select('.flw-item');
    for (var element in animeElements) {
      final linkElement = element.selectFirst('.film-detail h3 a');
      final imageElement = element.selectFirst('.film-poster img');
      MManga anime = MManga();
      anime.name = linkElement?.attr('data-jname') ?? linkElement?.text;
      anime.imageUrl = imageElement?.getSrc ?? imageElement?.attr('data-src');
      anime.link = linkElement?.getHref;
      animeList.add(anime);
    }
    final nextPageElement = doc.selectFirst('li.page-item a[title="Next"]');
    return MPages(animeList, nextPageElement != null);
  }

  String ajaxRoute(String baseUrl) {
    if (baseUrl == "https://kaido.to") {
      return "";
    }
    return "/v2";
  }

  List<SelectFilterOption> yearList = [
    for (var i = 1917; i < 2026; i++)
      SelectFilterOption(i.toString(), i.toString()),
    SelectFilterOption("All", ""),
  ];

  @override
  List<dynamic> getFilterList() {
    return [
      SelectFilter("TypeFilter", "Type", 0, [
        SelectFilterOption("All", ""),
        SelectFilterOption("Movie", "1"),
        SelectFilterOption("TV", "2"),
        SelectFilterOption("OVA", "3"),
        SelectFilterOption("ONA", "4"),
        SelectFilterOption("Special", "5"),
        SelectFilterOption("Music", "6"),
      ]),
      SelectFilter("StatusFilter", "Status", 0, [
        SelectFilterOption("All", ""),
        SelectFilterOption("Finished Airing", "1"),
        SelectFilterOption("Currently Airing", "2"),
        SelectFilterOption("Not yet aired", "3"),
      ]),
      SelectFilter("RatedFilter", "Rated", 0, [
        SelectFilterOption("All", ""),
        SelectFilterOption("G", "1"),
        SelectFilterOption("PG", "2"),
        SelectFilterOption("PG-13", "3"),
        SelectFilterOption("R", "4"),
        SelectFilterOption("R+", "5"),
        SelectFilterOption("Rx", "6"),
      ]),
      SelectFilter("ScoreFilter", "Score", 0, [
        SelectFilterOption("All", ""),
        SelectFilterOption("(1) Appalling", "1"),
        SelectFilterOption("(2) Horrible", "2"),
        SelectFilterOption("(3) Very Bad", "3"),
        SelectFilterOption("(4) Bad", "4"),
        SelectFilterOption("(5) Average", "5"),
        SelectFilterOption("(6) Fine", "6"),
        SelectFilterOption("(7) Good", "7"),
        SelectFilterOption("(8) Very Good", "8"),
        SelectFilterOption("(9) Great", "9"),
        SelectFilterOption("(10) Masterpiece", "10"),
      ]),
      SelectFilter("SeasonFilter", "Season", 0, [
        SelectFilterOption("All", ""),
        SelectFilterOption("Spring", "1"),
        SelectFilterOption("Summer", "2"),
        SelectFilterOption("Fall", "3"),
        SelectFilterOption("Winter", "4"),
      ]),
      SelectFilter("LanguageFilter", "Language", 0, [
        SelectFilterOption("All", ""),
        SelectFilterOption("SUB", "1"),
        SelectFilterOption("DUB", "2"),
        SelectFilterOption("SUB & DUB", "3"),
      ]),
      SelectFilter("SortFilter", "Sort by", 0, [
        SelectFilterOption("All", ""),
        SelectFilterOption("Default", "default"),
        SelectFilterOption("Recently Added", "recently_added"),
        SelectFilterOption("Recently Updated", "recently_updated"),
        SelectFilterOption("Score", "score"),
        SelectFilterOption("Name A-Z", "name_az"),
        SelectFilterOption("Released Date", "released_date"),
        SelectFilterOption("Most Watched", "most_watched"),
      ]),
      SelectFilter(
        "StartYearFilter",
        "Start year",
        0,
        yearList.reversed.toList(),
      ),
      SelectFilter("StartMonthFilter", "Start month", 0, [
        SelectFilterOption("All", ""),
        for (var i = 1; i < 13; i++)
          SelectFilterOption(i.toString(), i.toString()),
      ]),
      SelectFilter("StartDayFilter", "Start day", 0, [
        SelectFilterOption("All", ""),
        for (var i = 1; i < 32; i++)
          SelectFilterOption(i.toString(), i.toString()),
      ]),
      SelectFilter("EndYearFilter", "End year", 0, yearList.reversed.toList()),
      SelectFilter("EndmonthFilter", "End month", 0, [
        SelectFilterOption("All", ""),
        for (var i = 1; i < 32; i++)
          SelectFilterOption(i.toString(), i.toString()),
      ]),
      SelectFilter("EndDayFilter", "End day", 0, [
        SelectFilterOption("All", ""),
        for (var i = 1; i < 32; i++)
          SelectFilterOption(i.toString(), i.toString()),
      ]),
      GroupFilter("GenreFilter", "Genre", [
        CheckBoxFilter("Action", "1"),
        CheckBoxFilter("Adventure", "2"),
        CheckBoxFilter("Cars", "3"),
        CheckBoxFilter("Comedy", "4"),
        CheckBoxFilter("Dementia", "5"),
        CheckBoxFilter("Demons", "6"),
        CheckBoxFilter("Drama", "8"),
        CheckBoxFilter("Ecchi", "9"),
        CheckBoxFilter("Fantasy", "10"),
        CheckBoxFilter("Game", "11"),
        CheckBoxFilter("Harem", "35"),
        CheckBoxFilter("Historical", "13"),
        CheckBoxFilter("Horror", "14"),
        CheckBoxFilter("Isekai", "44"),
        CheckBoxFilter("Josei", "43"),
        CheckBoxFilter("Kids", "15"),
        CheckBoxFilter("Magic", "16"),
        CheckBoxFilter("Martial Arts", "17"),
        CheckBoxFilter("Mecha", "18"),
        CheckBoxFilter("Military", "38"),
        CheckBoxFilter("Music", "19"),
        CheckBoxFilter("Mystery", "7"),
        CheckBoxFilter("Parody", "20"),
        CheckBoxFilter("Police", "39"),
        CheckBoxFilter("Psychological", "40"),
        CheckBoxFilter("Romance", "22"),
        CheckBoxFilter("Samurai", "21"),
        CheckBoxFilter("School", "23"),
        CheckBoxFilter("Sci-Fi", "24"),
        CheckBoxFilter("Seinen", "42"),
        CheckBoxFilter("Shoujo", "25"),
        CheckBoxFilter("Shoujo Ai", "26"),
        CheckBoxFilter("Shounen", "27"),
        CheckBoxFilter("Shounen Ai", "28"),
        CheckBoxFilter("Slice of Life", "36"),
        CheckBoxFilter("Space", "29"),
        CheckBoxFilter("Sports", "30"),
        CheckBoxFilter("Super Power", "31"),
        CheckBoxFilter("Supernatural", "37"),
        CheckBoxFilter("Thriller", "41"),
        CheckBoxFilter("Vampire", "32"),
        CheckBoxFilter("Yaoi", "33"),
        CheckBoxFilter("Yuri", "34"),
      ]),
    ];
  }

  @override
  List<dynamic> getSourcePreferences() {
    return [
      ListPreference(
        key: "preferred_quality",
        title: "Preferred Quality",
        summary: "",
        valueIndex: 1,
        entries: ["1080p", "720p", "480p", "360p"],
        entryValues: ["1080", "720", "480", "360"],
      ),
      if (source.name == "HiAnime")
        ListPreference(
          key: "preferred_server2",
          title: "Preferred server",
          summary: "",
          valueIndex: 0,
          entries: ["HD-1", "HD-2", "HD-3"],
          entryValues: ["HD-1", "HD-2", "HD-3"],
        ),
      if (source.name != "HiAnime")
        ListPreference(
          key: "preferred_server2",
          title: "Preferred server",
          summary: "",
          valueIndex: 0,
          entries: ["Vidstreaming", "Vidcloud"],
          entryValues: ["Vidstreaming", "Vidcloud"],
        ),
      ListPreference(
        key: "preferred_type1",
        title: "Preferred Type",
        summary: "",
        valueIndex: 0,
        entries: ["Sub", "Dub"],
        entryValues: ["sub", "dub"],
      ),
      if (source.name != "HiAnime")
        MultiSelectListPreference(
          key: "hoster_selection3",
          title: "Enable/Disable Hosts",
          summary: "",
          entries: ["Vidstreaming", "Vidcloud"],
          entryValues: ["Vidstreaming", "Vidcloud"],
          values: ["Vidstreaming", "Vidcloud"],
        ),
      if (source.name == "HiAnime")
        MultiSelectListPreference(
          key: "hoster_selection3",
          title: "Enable/Disable Hosts",
          summary: "",
          entries: ["HD-1", "HD-2", "HD-3"],
          entryValues: ["HD-1", "HD-2", "HD-3"],
          values: ["HD-1", "HD-2"],
        ),
      MultiSelectListPreference(
        key: "type_selection_3",
        title: "Enable/Disable Types",
        summary: "",
        entries: ["Sub", "Dub", "Raw"],
        entryValues: ["sub", "dub", "raw"],
        values: ["sub", "dub"],
      ),
    ];
  }

  List<Video> sortVideos(List<Video> videos) {
    String quality = preferencePreferredQuality();
    String server = preferencePreferredServer();
    String type = preferencePreferredType();
    videos.sort((Video a, Video b) {
      int qualityMatchA = 0;

      if (a.quality.contains(quality) &&
          a.quality.toLowerCase().contains(type.toLowerCase()) &&
          a.quality.toLowerCase().contains(server.toLowerCase())) {
        qualityMatchA = 1;
      }
      int qualityMatchB = 0;
      if (b.quality.contains(quality) &&
          b.quality.toLowerCase().contains(type.toLowerCase()) &&
          b.quality.toLowerCase().contains(server.toLowerCase())) {
        qualityMatchB = 1;
      }
      if (qualityMatchA != qualityMatchB) {
        return qualityMatchB - qualityMatchA;
      }

      final bigRegex = RegExp(r' - (\d+).*$');
      final regex = RegExp(r'\d+');
      String? matchA = regex.stringMatch(bigRegex.stringMatch(a.quality) ?? "");
      String? matchB = regex.stringMatch(bigRegex.stringMatch(b.quality) ?? "");
      final int qualityNumA = int.tryParse(matchA ?? '0') ?? 0;
      final int qualityNumB = int.tryParse(matchB ?? '0') ?? 0;
      return qualityNumB - qualityNumA;
    });
    return videos;
  }

  /// return list of enabled hosters from preferences\
  /// e.g. `HD-1`, `HD-2`, `HD-3` for HiAnime
  List<String> preferenceHosterSelection() {
    return getPreferenceValue(source.id ?? 0, "hoster_selection3");
  }

  /// return list of enabled types from preferences\
  /// e.g. `sub`, `dub`, `raw`
  List<String> preferenceTypeSelection() {
    return getPreferenceValue(source.id ?? 0, "type_selection_3");
  }

  String preferencePreferredQuality() {
    return getPreferenceValue(source.id ?? 0, "preferred_quality");
  }

  String preferencePreferredServer() {
    return getPreferenceValue(source.id ?? 0, "preferred_server2");
  }

  String preferencePreferredType() {
    return getPreferenceValue(source.id ?? 0, "preferred_type1");
  }

  String ll(String url) {
    if (url.contains("?")) {
      return "&";
    }
    return "?";
  }
}

ZoroTheme main(MSource source) {
  return ZoroTheme(source: source);
}
