import 'package:mangayomi/bridge_lib.dart';
import 'dart:convert';

class Utils {
  static String getMangaNameFromElement(MElement element, [bool isEn = true]) {
    final elm = element.selectFirst(".film-name > a");
    String? engTitle = elm?.text?.trim();
    String? japTitle = elm?.attr("data-jname")?.trim();
    if (isEn) return engTitle ?? japTitle ?? "No Title";
    return japTitle ?? engTitle ?? "No Title";
  }

  static String getStatsFromElement(MElement element) {
    List<String> stats = [];
    List<MElement> infoElements =
        element.select(".film-stats > .tick > .item") ?? [];
    for (var infoElm in infoElements) {
      String? txt = infoElm.text?.trim();
      txt != null ? stats.add(txt) : null;
    }
    return stats.join(", ");
  }

  static String getDescriptionFromElement(MElement element) {
    List<String> lines =
        (element.selectFirst(".anisc-info")?.text?.trim() ?? "").split(
          RegExp(r"\s{5,}"),
        );
    List<String> descriptionLines = [];
    String tempLine = "";
    for (String line in lines) {
      if (line.contains(RegExp(r"^[a-zA-Z ]+:"))) {
        descriptionLines.add(tempLine);
        tempLine = "$line";
        continue;
      }
      tempLine += "\n$line";
    }
    return descriptionLines.join("\n\n").trim();
  }

  static List<String> getGenresFromElement(MElement element) {
    List<String> genres = [];
    List<MElement> genreElements =
        element.select(".anisc-info div [title]") ?? [];
    for (var genreElm in genreElements) {
      String? txt = genreElm.text?.trim();
      txt != null ? genres.add(txt) : null;
    }
    return genres;
  }

  static String getStatusString(MElement element) {
    MElement? statusElement = element.selectFirst(
      ".anisc-info .item:contains(Status) .name",
    );
    if (statusElement == null) return "Unknown";
    return statusElement.text?.trim() ?? "Unknown";
  }

  static String getEpisodeTitleFromElement(
    MElement episodeElm, [
    bool isEn = true,
  ]) {
    final elm = episodeElm.selectFirst(".ep-name");
    String? engTitle = elm?.text?.trim();
    String? japTitle = elm?.attr("data-jname")?.trim();
    if (isEn) return engTitle ?? japTitle ?? "No Title";
    return japTitle ?? engTitle ?? "No Title";
  }

  static String getEpisodeDataNumberFromElement(MElement episodeElm) {
    return episodeElm.attr("data-number") ?? "";
  }

  static String getEpisodeEndpointFromElement(MElement episodeElm) {
    return episodeElm.attr("href") ?? "";
  }
}

class AniwatchtvSource extends MProvider {
  AniwatchtvSource({required this.source});

  MSource source;

  final Client client = Client();

  @override
  bool get supportsLatest => true;

  @override
  Map<String, String> get headers => {
    "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.131 Safari/537.36",
    "referer": "https://aniwatchtv.to/",
  };

  String baseUrl = "https://aniwatchtv.to";

  String addOption(String url, String key, String value) {
    if (value.isEmpty) return "";
    if (url.endsWith("?"))
      return "$key=$value";
    else
      return "&$key=$value";
  }

  Future<MPages> _getFiltered(
    FilterList filterList,
    int page, [
    String? query,
  ]) async {
    final filters = filterList.filters;
    String end = "";
    if (query != null && query.isNotEmpty) {
      end += "search?";
      end += addOption(end, "keyword", query);
    } else {
      end += "filter?";
    }
    for (var filter in filters) {
      if (filter.type == "TypeFilter") {
        String option = filter.values[filter.state].value;
        end += addOption(end, "type", option);
      } else if (filter.type == "StatusFilter") {
        String option = filter.values[filter.state].value;
        end += addOption(end, "status", option);
      } else if (filter.type == "RatedFilter") {
        String option = filter.values[filter.state].value;
        end += addOption(end, "rated", option);
      } else if (filter.type == "ScoreFilter") {
        String option = filter.values[filter.state].value;
        end += addOption(end, "score", option);
      } else if (filter.type == "SeasonFilter") {
        String option = filter.values[filter.state].value;
        end += addOption(end, "season", option);
      } else if (filter.type == "LanguageFilter") {
        String option = filter.values[filter.state].value;
        end += addOption(end, "language", option);
      } else if (filter.type == "StartYearFilter") {
        String option = filter.values[filter.state].value;
        end += addOption(end, "sy", option);
      } else if (filter.type == "StartMonthFilter") {
        String option = filter.values[filter.state].value;
        end += addOption(end, "sm", option);
      } else if (filter.type == "StartDayFilter") {
        String option = filter.values[filter.state].value;
        end += addOption(end, "sd", option);
      } else if (filter.type == "EndYearFilter") {
        String option = filter.values[filter.state].value;
        end += addOption(end, "ey", option);
      } else if (filter.type == "EndMonthFilter") {
        String option = filter.values[filter.state].value;
        end += addOption(end, "em", option);
      } else if (filter.type == "EndDayFilter") {
        String option = filter.values[filter.state].value;
        end += addOption(end, "ed", option);
      } else if (filter.type == "SortFilter") {
        String option = filter.values[filter.state].value;
        end += addOption(end, "sort", option);
      } else if (filter.type == "GenreFilter") {
        List<String> selectedGenres = [];
        for (var genre in filter.state) {
          if (genre.state) selectedGenres.add(genre.value);
        }
        if (selectedGenres.isNotEmpty)
          end += addOption(end, "genres", selectedGenres.join(","));
      }
    }
    end += addOption(end, "page", "$page");
    final response = await client.get(
      Uri.parse("${this.baseUrl}/$end"),
      headers: this.headers,
    );
    if (response.statusCode != 200)
      throw Exception(
        "Error fetching data: ${response.statusCode} WEBSITE DOWN?",
      );
    List<MElement> cards =
        parseHtml(response.body).getElementsByClassName("flw-item") ?? [];
    List<MManga> mangaList = [];
    for (var card in cards) {
      String? imgUrl = card.selectFirst("img")?.attr("data-src");
      String? linkUrl = card.selectFirst("a")?.attr("href");
      String title = Utils.getMangaNameFromElement(card, this.preferenceIsEn);
      int subCount =
          int.tryParse(
            card.selectFirst(".tick-item.tick-sub")?.text?.trim() ?? "0",
          ) ??
          0;
      int dubCount =
          int.tryParse(
            card.selectFirst(".tick-item.tick-dub")?.text?.trim() ?? "0",
          ) ??
          0;
      int totalEps =
          int.tryParse(
            card.selectFirst(".tick-item.tick-eps")?.text?.trim() ?? "0",
          ) ??
          0;
      // this type is same as TypeFilter
      String type = card.selectFirst(".fdi-item")?.text?.trim() ?? "";
      int duration =
          int.tryParse(
            card.selectFirst(".fdi-item.fdi-duration")?.text?.trim() ?? "0",
          ) ??
          0;

      mangaList.add(
        MManga(
          name: title,
          imageUrl: imgUrl,
          link: "${this.baseUrl}${linkUrl ?? ""}",
        ),
      );
    }
    return MPages(mangaList, cards.isNotEmpty);
  }

  Future<List<MChapter>?> _getChapters(String url) async {
    final String mangaId = url.split('/').last.split('-').last;
    final String endpoint = "/ajax/v2/episode/list/$mangaId";
    final json = jsonDecode(
      (await client.get(
        Uri.parse("${this.baseUrl}$endpoint"),
        headers: this.headers..addAll({"referer": url}),
      )).body,
    );
    if (json == null || (json as Map<String, dynamic>).isEmpty)
      throw Exception(
        "Error fetching chapters: ${json.statusCode} WEBSITE DOWN OR STRUCTURE CHANGES?",
      );
    MDocument document = parseHtml(json["html"] ?? "");
    List<MChapter> chapters = [];
    List<MElement> episodeElements = document.select(".ssl-item.ep-item") ?? [];
    for (var episodeElm in episodeElements) {
      chapters.add(
        MChapter(
          name:
              "Chapter ${Utils.getEpisodeDataNumberFromElement(episodeElm)} - ${Utils.getEpisodeTitleFromElement(episodeElm, this.preferenceIsEn)}",
          url:
              "${this.baseUrl}${Utils.getEpisodeEndpointFromElement(episodeElm)}",
          // NOTE: idk why but the description is not showing up in the app, so added it to the name for now, :)
          description: Utils.getEpisodeTitleFromElement(
            episodeElm,
            this.preferenceIsEn,
          ),
        ),
      );
    }
    chapters.sort(
      (b, a) => (int.parse(a.name?.split(' - ').first.split(' ').last ?? "0"))
          .compareTo(
            int.parse(b.name?.split(' - ').first.split(' ').last ?? "0"),
          ),
    );
    return chapters;
  }

  @override
  Future<MPages> getPopular(int page) async {
    final filters = getFilterList();
    // most watched is default for popular
    for (var filter in filters) {
      if (filter.type == "SortFilter") {
        (filter as SelectFilter).state = 6;
        break;
      }
    }
    return _getFiltered(FilterList(filters), page);
  }

  @override
  Future<MPages> getLatestUpdates(int page) async {
    final filters = getFilterList();
    // recent updates is default for getlatestupdates
    for (var filter in filters) {
      if (filter.type == "SortFilter") {
        (filter as SelectFilter).state = 2;
        break;
      }
    }
    return _getFiltered(FilterList(filters), page);
  }

  @override
  Future<MPages> search(String query, int page, FilterList filterList) async {
    return _getFiltered(filterList, page, query);
  }

  @override
  Future<MManga> getDetail(String url) async {
    final response = await client.get(Uri.parse(url), headers: this.headers);
    if (response.statusCode != 200)
      throw Exception(
        "Error fetching data: ${response.statusCode} WEBSITE DOWN?",
      );
    MElement? document = parseHtml(
      response.body,
    ).selectFirst(".ani_detail-stage");
    if (document == null) {
      throw Exception(
        "Error parsing data: Document is null, website structure changed?",
      );
    }
    List<MChapter>? chapters = await _getChapters(url);
    return MManga(
      author: Utils.getStatsFromElement(document),
      artist: Utils.getStatsFromElement(document),
      genre: Utils.getGenresFromElement(document),
      status: parseStatus(Utils.getStatusString(document), [
        {"Currently Airing": 0, "Finished Airing": 1, "Not yet aired": 4},
      ]),
      description: Utils.getDescriptionFromElement(document),
      chapters: chapters,
    );
  }

  // For novel html content
  @override
  Future<String> getHtmlContent(String name, String url) async {
    return "";
  }

  // Clean html up for reader
  @override
  Future<String> cleanHtmlContent(String html) async {
    return "";
  }

  // For anime episode video list
  @override
  Future<List<MVideo>> getVideoList(String url) async {
    final serverTypes = await _getVideoServerTypes(url);
    // throw Exception("Video sources found: ${serverTypes.toString()}");
    // Exception: Video sources found: {sub: {VidSrc: [1145057, 4], T-Cloud: [1318123, 6], MegaCloud: [1145052, 1]}, dub: {VidSrc: [1148044, 4], MegaCloud: [1148038, 1], T-Cloud: [1318135, 6]}}
    List<MVideo> videos = [];
    for (var type in ["sub", "dub"]) {
      if (!serverTypes.containsKey(type)) continue;
      for (var serverName in preferenceEnabledVideoServer) {
        final String dataId = serverTypes[type]![serverName]![0];
        List<MVideo> v = await _getVideoServers(type, serverName, dataId);
        if (v.isNotEmpty) videos.addAll(v);
      }
    }
    return sortVideos(videos);
  }

  // For manga chapter pages
  @override
  Future<List<String>> getPageList(String url) async {
    return [];
  }

  List<MVideo> sortVideos(List<MVideo> videos) {
    String server = preferencePreferredVideoServer;
    String type = preferencePreferredAudio;
    videos.sort((Video a, Video b) {
      int qualityMatchA = 0;

      if (a.quality.toLowerCase().contains(type.toLowerCase()) &&
          a.quality.toLowerCase().contains(server.toLowerCase())) {
        qualityMatchA = 1;
      }
      int qualityMatchB = 0;
      if (b.quality.toLowerCase().contains(type.toLowerCase()) &&
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

  Future<List<MVideo>> _getVideoServers(
    String type,
    String serverName,
    String dataId,
  ) async {
    final heheaders = {
      "referer": "https://megacloud.blog/",
      "user-agent": this.headers["user-agent"] ?? "",
    };
    final streamData = await _getStreamData(dataId);
    final name = "$serverName - $type";

    List<Track> subtitles = [];
    (streamData["tracks"] ?? []).forEach((track) {
      if (track["kind"] == "subtitles" || track["kind"] == "captions") {
        subtitles.add(
          MTrack(file: track["file"] ?? track["link"], label: track["label"]),
        );
      }
    });

    List<MVideo> videos = [];
    List<dynamic> sources = streamData["sources"] ?? [];
    if (sources.isNotEmpty) {
      String masterUrl = sources[0]["file"];
      String? type = sources[0]["type"];
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

  String __getNonce(String html) {
    String line = html;
    line = substringAfter(line, "</script>\n    ");
    line = substringBefore(line, "</head>");
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
  Future<Map<String, dynamic>> _getStreamData(String dataId) async {
    final String endpoint = "/ajax/v2/episode/sources?id=$dataId";
    final json = jsonDecode(
      (await client.get(
        Uri.parse("${this.baseUrl}$endpoint"),
        headers: this.headers,
      )).body,
    );
    if (json == null || (json as Map<String, dynamic>).isEmpty)
      throw Exception(
        "Error fetching stream data: ${json.statusCode} WEBSITE DOWN OR STRUCTURE CHANGES?",
      );
    String secretLink = json["link"];
    var response = await client.get(
      Uri.parse(secretLink),
      headers: this.headers,
    );
    if (response.statusCode != 200)
      throw Exception(
        "Error fetching stream data: ${response.statusCode} WEBSITE DOWN OR STRUCTURE CHANGES?",
      );
    final String id = substringBefore(substringAfterLast(secretLink, '/'), '?');
    final String nonce = __getNonce(response.body);
    response = await client.get(
      Uri.parse(
        "${substringBeforeLast(secretLink, '/')}/getSources?id=$id&_k=$nonce",
      ),
      headers: {
        "referer": secretLink,
        "user-agent": this.headers["user-agent"] ?? "",
      },
    );
    if (response.statusCode != 200)
      throw Exception(
        "Error fetching stream data: ${response.statusCode} INVALID KEYS, SOMETHING CHANGED?",
      );
    return jsonDecode(response.body);
  }

  Future<Map<String, Map<String, List<String>>>> _getVideoServerTypes(
    String url,
  ) async {
    final String episodeId = url.split('=').last;
    final String endpoint = "/ajax/v2/episode/servers?episodeId=$episodeId";
    final json = jsonDecode(
      (await client.get(
        Uri.parse("${this.baseUrl}$endpoint"),
        headers: this.headers..addAll({"referer": url}),
      )).body,
    );
    if (json == null || (json as Map<String, dynamic>).isEmpty)
      throw Exception(
        "Error fetching video sources: ${json.statusCode} WEBSITE DOWN OR STRUCTURE CHANGES?",
      );
    Map<String, Map<String, List<String>>> servers = {};
    MDocument document = parseHtml(json["html"] ?? "");
    for (MElement elm in document.select("div[data-id]") ?? []) {
      String? dataType = elm.attr("data-type"); // sub, dub
      String? serverName = elm.text?.trim(); // VidSrc, MegaCloud, T-Cloud
      String? dataId = elm.attr("data-id"); // unique id, for video links
      String? dataServerId = elm.attr("data-server-id"); // 4, 1, 6
      if (dataType == null ||
          serverName == null ||
          dataId == null ||
          dataServerId == null)
        continue;
      servers.putIfAbsent(dataType, () => {});
      servers[dataType]![serverName] = [dataId, dataServerId];
    }
    return servers;
  }

  @override
  List<dynamic> getFilterList() {
    return [
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
      ]),
      SeparatorFilter(),
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
        SelectFilterOption("G - All Ages", "1"),
        SelectFilterOption("PG - Children", "2"),
        SelectFilterOption("PG-13 - Teens 13 or older", "3"),
        SelectFilterOption("R - 17+ (violence & profanity)", "4"),
        SelectFilterOption("R+ - Mild Nudity", "5"),
        SelectFilterOption("Rx - Hentai", "6"),
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
      SelectFilter("SortFilter", "Sort By", 0, [
        SelectFilterOption("Default", ""),
        SelectFilterOption("Recently Added", "recently_added"),
        SelectFilterOption("Recently Updated", "recently_updated"),
        SelectFilterOption("Score", "score"),
        SelectFilterOption("Name A-Z", "name_az"),
        SelectFilterOption("Released Date", "released_date"),
        SelectFilterOption("Most Watched", "most_watched"),
      ]),
      SeparatorFilter(),
      HeaderFilter("Start Date"),
      SelectFilter("StartYearFilter", "Year", 0, [
        SelectFilterOption("All", ""),
        SelectFilterOption("2026", "2026"),
        SelectFilterOption("2025", "2025"),
        SelectFilterOption("2024", "2024"),
        SelectFilterOption("2023", "2023"),
        SelectFilterOption("2022", "2022"),
        SelectFilterOption("2021", "2021"),
        SelectFilterOption("2020", "2020"),
        SelectFilterOption("2019", "2019"),
        SelectFilterOption("2018", "2018"),
        SelectFilterOption("2017", "2017"),
        SelectFilterOption("2016", "2016"),
        SelectFilterOption("2015", "2015"),
        SelectFilterOption("2014", "2014"),
        SelectFilterOption("2013", "2013"),
        SelectFilterOption("2012", "2012"),
        SelectFilterOption("2011", "2011"),
        SelectFilterOption("2010", "2010"),
        SelectFilterOption("2009", "2009"),
        SelectFilterOption("2008", "2008"),
        SelectFilterOption("2007", "2007"),
        SelectFilterOption("2006", "2006"),
        SelectFilterOption("2005", "2005"),
        SelectFilterOption("2004", "2004"),
        SelectFilterOption("2003", "2003"),
        SelectFilterOption("2002", "2002"),
        SelectFilterOption("2001", "2001"),
        SelectFilterOption("2000", "2000"),
      ]),
      SelectFilter("StartMonthFilter", "Month", 0, [
        SelectFilterOption("All", ""),
        SelectFilterOption("01", "1"),
        SelectFilterOption("02", "2"),
        SelectFilterOption("03", "3"),
        SelectFilterOption("04", "4"),
        SelectFilterOption("05", "5"),
        SelectFilterOption("06", "6"),
        SelectFilterOption("07", "7"),
        SelectFilterOption("08", "8"),
        SelectFilterOption("09", "9"),
        SelectFilterOption("10", "10"),
        SelectFilterOption("11", "11"),
        SelectFilterOption("12", "12"),
      ]),
      SelectFilter("StartDayFilter", "Day", 0, [
        SelectFilterOption("All", ""),
        SelectFilterOption("01", "1"),
        SelectFilterOption("02", "2"),
        SelectFilterOption("03", "3"),
        SelectFilterOption("04", "4"),
        SelectFilterOption("05", "5"),
        SelectFilterOption("06", "6"),
        SelectFilterOption("07", "7"),
        SelectFilterOption("08", "8"),
        SelectFilterOption("09", "9"),
        SelectFilterOption("10", "10"),
        SelectFilterOption("11", "11"),
        SelectFilterOption("12", "12"),
        SelectFilterOption("13", "13"),
        SelectFilterOption("14", "14"),
        SelectFilterOption("15", "15"),
        SelectFilterOption("16", "16"),
        SelectFilterOption("17", "17"),
        SelectFilterOption("18", "18"),
        SelectFilterOption("19", "19"),
        SelectFilterOption("20", "20"),
        SelectFilterOption("21", "21"),
        SelectFilterOption("22", "22"),
        SelectFilterOption("23", "23"),
        SelectFilterOption("24", "24"),
        SelectFilterOption("25", "25"),
        SelectFilterOption("26", "26"),
        SelectFilterOption("27", "27"),
        SelectFilterOption("28", "28"),
        SelectFilterOption("29", "29"),
        SelectFilterOption("30", "30"),
        SelectFilterOption("31", "31"),
      ]),
      SeparatorFilter(),
      HeaderFilter("End Date"),
      SelectFilter("EndYearFilter", "Year", 0, [
        SelectFilterOption("All", ""),
        SelectFilterOption("2026", "2026"),
        SelectFilterOption("2025", "2025"),
        SelectFilterOption("2024", "2024"),
        SelectFilterOption("2023", "2023"),
        SelectFilterOption("2022", "2022"),
        SelectFilterOption("2021", "2021"),
        SelectFilterOption("2020", "2020"),
        SelectFilterOption("2019", "2019"),
        SelectFilterOption("2018", "2018"),
        SelectFilterOption("2017", "2017"),
        SelectFilterOption("2016", "2016"),
        SelectFilterOption("2015", "2015"),
        SelectFilterOption("2014", "2014"),
        SelectFilterOption("2013", "2013"),
        SelectFilterOption("2012", "2012"),
        SelectFilterOption("2011", "2011"),
        SelectFilterOption("2010", "2010"),
        SelectFilterOption("2009", "2009"),
        SelectFilterOption("2008", "2008"),
        SelectFilterOption("2007", "2007"),
        SelectFilterOption("2006", "2006"),
        SelectFilterOption("2005", "2005"),
        SelectFilterOption("2004", "2004"),
        SelectFilterOption("2003", "2003"),
        SelectFilterOption("2002", "2002"),
        SelectFilterOption("2001", "2001"),
        SelectFilterOption("2000", "2000"),
      ]),
      SelectFilter("EndMonthFilter", "Month", 0, [
        SelectFilterOption("All", ""),
        SelectFilterOption("01", "1"),
        SelectFilterOption("02", "2"),
        SelectFilterOption("03", "3"),
        SelectFilterOption("04", "4"),
        SelectFilterOption("05", "5"),
        SelectFilterOption("06", "6"),
        SelectFilterOption("07", "7"),
        SelectFilterOption("08", "8"),
        SelectFilterOption("09", "9"),
        SelectFilterOption("10", "10"),
        SelectFilterOption("11", "11"),
        SelectFilterOption("12", "12"),
      ]),
      SelectFilter("EndDayFilter", "Day", 0, [
        SelectFilterOption("All", ""),
        SelectFilterOption("01", "1"),
        SelectFilterOption("02", "2"),
        SelectFilterOption("03", "3"),
        SelectFilterOption("04", "4"),
        SelectFilterOption("05", "5"),
        SelectFilterOption("06", "6"),
        SelectFilterOption("07", "7"),
        SelectFilterOption("08", "8"),
        SelectFilterOption("09", "9"),
        SelectFilterOption("10", "10"),
        SelectFilterOption("11", "11"),
        SelectFilterOption("12", "12"),
        SelectFilterOption("13", "13"),
        SelectFilterOption("14", "14"),
        SelectFilterOption("15", "15"),
        SelectFilterOption("16", "16"),
        SelectFilterOption("17", "17"),
        SelectFilterOption("18", "18"),
        SelectFilterOption("19", "19"),
        SelectFilterOption("20", "20"),
        SelectFilterOption("21", "21"),
        SelectFilterOption("22", "22"),
        SelectFilterOption("23", "23"),
        SelectFilterOption("24", "24"),
        SelectFilterOption("25", "25"),
        SelectFilterOption("26", "26"),
        SelectFilterOption("27", "27"),
        SelectFilterOption("28", "28"),
        SelectFilterOption("29", "29"),
        SelectFilterOption("30", "30"),
        SelectFilterOption("31", "31"),
      ]),
      SeparatorFilter(),
    ];
  }

  @override
  List<dynamic> getSourcePreferences() {
    return [
      CheckBoxPreference(
        key: "title_language_preference",
        title: "Title Language",
        summary:
            "Enable to show titles (names only) in English (disable to show in Japanese where available)",
        value: true,
      ),
      ListPreference(
        key: "preferred_audio_preference",
        title: "Preferred Audio SUB/DUB",
        summary:
            "Choose your preferred audio for anime episodes. This will be used to priortize the selected audio where both SUB and DUB are available.",
        entries: ["SUB", "DUB"],
        entryValues: ["sub", "dub"],
        valueIndex: 0,
      ),
      ListPreference(
        key: "preferred_video_source_preference",
        title: "Preferred Video Source",
        summary: "It will always be the default go-to when you open a episode.",
        entries: ["VidSrc", "MegaCloud", "T-Cloud"],
        entryValues: ["VidSrc", "MegaCloud", "T-Cloud"],
        valueIndex: 0,
      ),
      MultiSelectListPreference(
        key: "preferred_video_sources_enabled_preference",
        title: "Enabled Video Sources",
        summary:
            "Selects which servers are enabled for fetching videos (if you disable a server here, it will not be used at all, even if it's the preferred source. This is useful if you want to exclude certain servers entirely).",
        entries: ["VidSrc", "MegaCloud", "T-Cloud"],
        entryValues: ["VidSrc", "MegaCloud", "T-Cloud"],
        values: ["VidSrc", "MegaCloud" /*"T-Cloud"*/],
      ),
    ];
  }

  bool get preferenceIsEn =>
      getPreferenceValue(this.source.id ?? 0, "title_language_preference") ??
      true;
  String get preferencePreferredAudio =>
      getPreferenceValue(this.source.id ?? 0, "preferred_audio_preference") ??
      "sub";
  String get preferencePreferredVideoServer =>
      getPreferenceValue(
        this.source.id ?? 0,
        "preferred_video_source_preference",
      ) ??
      "VidSrc";
  List<String> get preferenceEnabledVideoServer =>
      (getPreferenceValue(
                this.source.id ?? 0,
                "preferred_video_sources_enabled_preference",
              )
              as List<dynamic>?)
          ?.cast<String>() ??
      ["VidSrc", "MegaCloud", "T-Cloud"];
}

AniwatchtvSource main(MSource source) {
  return AniwatchtvSource(source: source);
}
