import 'package:mangayomi/bridge_lib.dart';
import 'dart:convert';

enum Status {
  ongoing,
  completed,
  canceled,
  unknown,
  onHiatus,
  publishingFinished,
}

class HelperUtils {
  static String convertJSONToQueryString(Map<String, dynamic> json) {
    List<String> queryParams = [];
    json.forEach((key, value) {
      String encodedValue = (value is Map || value is List)
          ? Uri.encodeComponent(jsonEncode(value))
          : Uri.encodeComponent(value.toString());
      queryParams.add('${Uri.encodeComponent(key)}=$encodedValue');
    });
    return queryParams.join('&');
  }

  static String parseUserAgent(String? userAgent) {
    if (userAgent == null || userAgent.isEmpty)
      return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";
    return userAgent;
  }
}

class MangaUtils {
  static String getMangaName(Map<String, String> mangaData) {
    return (mangaData["englishName"] ??
            mangaData["name"] ??
            mangaData["nativeName"] ??
            "No Title")
        .toString();
  }

  // Parse status from string to enum index
  static dynamic getStatus(String? status) {
    final statusList = [
      {
        "ongoing": 0,
        "complete": 1,
        "hiatus": 2,
        "canceled": 3,
        "publishingFinished": 4,
      },
    ];
    if (status == null) return parseStatus("unknown", statusList);
    status = status.toLowerCase();
    if (status.contains("finished") || status.contains("complete"))
      status = "complete";
    else if (status.contains("releasing") ||
        status.contains("ongoing") ||
        status.contains("publishing"))
      status = "ongoing";
    else
      status = "unknown";
    return parseStatus(status, statusList);
  }

  static String getAuthor(Map<String, dynamic> data) {
    if (data.containsKey("authors") && data["authors"] is List) {
      return (data["authors"] as List).first.toString();
    }
    return "None";
  }

  static String buildDescription(String? desc, List<String>? altNames) {
    final temp = desc;
    if (desc != null) desc = parseHtml(desc.replaceAll(r"<br>", "br2n")).text;
    if (desc == null)
      desc = (temp?.replaceAll(r"<br>", "br2n")) ?? "No Description";
    return desc.replaceAll(r'br2n', '\n') +
        ((altNames != null && altNames.isNotEmpty)
            ? "\n\nAlternative Names: \n${altNames.join('\n')}"
            : "");
  }

  static List<String> combineGenres(List<String> genres, List<String> tags) {
    final List<String> genreSet = [];
    for (var genre in genres) {
      if (!genreSet.contains(genre.toString())) genreSet.add(genre.toString());
    }
    for (var tag in tags) {
      if (!genreSet.contains(tag.toString())) genreSet.add(tag.toString());
    }
    return genreSet.toList();
  }
}

class Urls {
  static const String baseImgUrl =
      'https://wp.youtube-anime.com/aln.youtube-anime.com';
  static const String baseUrl = 'https://allmanga.to';
  static const String apiUrl = 'https://api.allanime.day';

  /// Returns absolute image URL
  static String buildImgUrl(String url) {
    if (url.startsWith('http')) {
      return url;
    } else {
      return '$baseImgUrl/$url';
    }
  }

  /// Returns absolute manga URL link
  static String buildMangaURL(String mangaId) {
    return '$baseUrl/manga/$mangaId';
  }
}

class AllManga extends MProvider {
  AllManga({required this.source});
  MSource source;
  @override
  final String baseUrl = Urls.baseUrl;
  final Client client = Client();
  @override
  bool get supportsLatest => true;

  @override
  Map<String, String> get headers => {
    "Accept": "*/*",
    "referer": "https://allmanga.to/",
    "user-agent": HelperUtils.parseUserAgent(preferenceUserAgent()),
  };

  Map<String, String> get postHeaders => {
    "Accept": "*/*",
    "referer": "https://allmanga.to/",
    "user-agent": HelperUtils.parseUserAgent(preferenceUserAgent()),
    "content-type": "application/json",
  };

  @override
  Future<MPages> getPopular(int page) async {
    List<MManga> mangaList = [];
    final apiQuery = HelperUtils.convertJSONToQueryString({
      "variables": {
        "type": "manga",
        "size": 20,
        "dateRange": 0,
        "page": page,
        "allowAdult": false,
        "allowUnknown": false,
      },
      "extensions": {
        "persistedQuery": {
          "version": 1,
          "sha256Hash":
              "1fc9651b0d4c3b9dfd2fa6e1d50b8f4d11ce37f988c23b8ee20f82159f7c1147",
        },
      },
    });
    final res = await client.get(
      Uri.parse("${source.apiUrl}/api?${apiQuery}"),
      headers: this.headers,
    );
    final json = jsonDecode(res.body);
    final data = json["data"]["queryPopular"];
    final items = data["recommendations"];
    for (var item in items) {
      final mangaData = item["anyCard"];
      MManga manga = MManga();
      manga.name = MangaUtils.getMangaName(mangaData);
      manga.imageUrl = Urls.buildImgUrl(mangaData["thumbnail"].toString());
      manga.link = Urls.buildMangaURL(mangaData["_id"].toString());
      mangaList.add(manga);
    }
    return MPages(mangaList, true, list: []);
  }

  @override
  Future<MPages> getLatestUpdates(int page) async {
    List<MManga> mangaList = [];
    final apiQuery = HelperUtils.convertJSONToQueryString({
      "variables": {
        "search": {"isManga": true},
        "limit": 26,
        "page": page,
        "translationType": "sub",
        "countryOrigin": "ALL",
      },
      "extensions": {
        "persistedQuery": {
          "version": 1,
          "sha256Hash":
              "3a4b7e9ef62953484a05dd40f35b35b118ad2ff3d5e72d2add79bcaa663271e7",
        },
      },
    });
    final res = await client.get(
      Uri.parse("${source.apiUrl}/api?${apiQuery}"),
      headers: this.headers,
    );
    final json = jsonDecode(res.body);
    final data = json["data"]["mangas"];
    final items = data["edges"];
    for (var item in items) {
      final mangaData = item;
      MManga manga = MManga();
      manga.name = MangaUtils.getMangaName(mangaData);
      manga.imageUrl = Urls.buildImgUrl(mangaData["thumbnail"].toString());
      manga.link = Urls.buildMangaURL(mangaData["_id"].toString());
      mangaList.add(manga);
    }
    return MPages(mangaList, true, list: []);
  }

  @override
  Future<MPages> search(String query, int page, FilterList filterList) async {
    List<MManga> mangaList = [];
    final apiQuery = HelperUtils.convertJSONToQueryString({
      "variables": {
        "search": {"isManga": true, "query": query},
        "limit": 26,
        "page": page,
        "translationType": "sub",
        "countryOrigin": "ALL",
      },
      "extensions": {
        "persistedQuery": {
          "version": 1,
          "sha256Hash":
              "3a4b7e9ef62953484a05dd40f35b35b118ad2ff3d5e72d2add79bcaa663271e7",
        },
      },
    });
    final res = await client.get(
      Uri.parse("${source.apiUrl}/api?${apiQuery}"),
      headers: this.headers,
    );
    final json = jsonDecode(res.body);
    final items = json["data"]["mangas"]["edges"];
    for (var item in items) {
      final mangaData = item;
      MManga manga = MManga();
      manga.name = MangaUtils.getMangaName(mangaData);
      manga.imageUrl = Urls.buildImgUrl(mangaData["thumbnail"].toString());
      manga.link = Urls.buildMangaURL(mangaData["_id"].toString());
      mangaList.add(manga);
    }
    return MPages(mangaList, true, list: []);
  }

  @override
  Future<MManga> getDetail(String url) async {
    final String mangaId = url.split("/").last;
    final mangaDetailsQuery = HelperUtils.convertJSONToQueryString({
      "variables": {
        "_id": "$mangaId",
        "search": {"allowAdult": false, "allowUnknown": false},
      },
      "extensions": {
        "persistedQuery": {
          "version": 1,
          "sha256Hash":
              "90024aeae9c1a4d3ace0473871dd1902e47fbcb8781ccbcd8ad81f8bb1f313ee",
        },
      },
    });
    dynamic res = await client.get(
      Uri.parse("${source.apiUrl}/api?${mangaDetailsQuery}"),
      headers: this.headers,
    );
    final json = jsonDecode(res.body);
    final data = json["data"]["manga"];
    MManga manga = MManga();
    manga.author = MangaUtils.getAuthor(data);
    manga.artist = manga.author;
    manga.genre = MangaUtils.combineGenres(
      data["genres"] ?? [],
      data["tags"] ?? [],
    );
    manga.imageUrl = Urls.buildImgUrl(data["thumbnail"].toString());
    manga.link = Urls.buildMangaURL(data["_id"].toString());
    manga.name = MangaUtils.getMangaName(data);
    manga.status = MangaUtils.getStatus(data['status']);
    manga.description = MangaUtils.buildDescription(
      data["description"],
      data["altNames"],
    );

    // Prepare to fetch all chapters
    final int end =
        double.tryParse(
          data["lastChapterInfo"]["sub"]["chapterString"],
        )?.ceil() ??
        9999;
    final String mangaChaptersQuery = HelperUtils.convertJSONToQueryString({
      "variables": {
        "showId": "manga@$mangaId",
        "episodeNumStart": 0,
        "episodeNumEnd": end,
      },
      "extensions": {
        "persistedQuery": {
          "version": 1,
          "sha256Hash":
              "ae7b2ed82ce3bf6fe9af426372174468958a066694167e6800bfcb3fcbdbb460",
        },
      },
    });
    res = await client.get(
      Uri.parse("${source.apiUrl}/api?${mangaChaptersQuery}"),
      headers: this.headers,
    );
    final chaptersJson = jsonDecode(res.body);
    final chaptersData = chaptersJson["data"]["episodeInfos"];
    chaptersData.sort((a, b) => a["episodeIdNum"].compareTo(b["episodeIdNum"]));
    List<MChapter> chapters = [];
    for (var chapterData in chaptersData) {
      MChapter chapter = MChapter();
      final chapterTitle = chapterData["notes"] ?? "";
      final String episodeIdStr = chapterData["episodeIdNum"].toString();
      chapter.name = "Chapter ${episodeIdStr}";
      String strDate = chapterData["uploadDates"]["sub"].toString();
      List<dynamic> dates = parseDates(
        [strDate],
        "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
        "en_US",
      );
      chapter.dateUpload = dates.isNotEmpty ? dates.first : null;
      chapter.thumbnailUrl = null;
      chapter.description = chapterTitle;
      chapter.url = Urls.buildMangaURL("$mangaId/chapter-${episodeIdStr}-sub");
      chapters.add(chapter);
    }
    manga.chapters = chapters;
    return manga;
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
    return [];
  }

  // For manga chapter pages
  @override
  Future<List<String>> getPageList(String url) async {
    final split = url.split("/");
    if (split.length < 3) return [];
    final String mangaId = split[split.length - 2];
    final chapter = split.last.split("-");
    final chapterNum = chapter[1];
    final chapterType = chapter.last;
    final res = await client.post(
      Uri.parse("${source.apiUrl}/api"),
      headers: this.postHeaders,
      body: jsonEncode({
        "query": """
          query (
            \$id: String!
            \$translationType: VaildTranslationTypeMangaEnumType!
            \$chapterNum: String!
          ) {
            chapterPages(
              mangaId: \$id
              translationType: \$translationType
              chapterString: \$chapterNum
            ) {
              edges {
                pictureUrls
                pictureUrlHead
              }
            }
          }
        """,
        "variables": {
          "id": "$mangaId",
          "translationType": chapterType == "sub" ? "sub" : "dub",
          "chapterNum": "$chapterNum",
        },
      }),
    );
    final json = jsonDecode(res.body);
    final pagesData = json["data"]["chapterPages"]["edges"]?.first;
    final baseUrl = pagesData["pictureUrlHead"];
    List<String> pageUrls = [];
    for (var page in pagesData["pictureUrls"]) {
      final String pageUrl = page["url"].toString();
      pageUrls.add("$baseUrl/$pageUrl");
    }
    return pageUrls;
  }

  @override
  List<dynamic> getFilterList() {
    // TODO
    return [];
  }

  @override
  List<dynamic> getSourcePreferences() {
    return [
      EditTextPreference(
        key: "USERAGENT",
        title: "User Agent",
        summary: "Set a custom user agent for requests",
        value: "",
        dialogTitle: "User Agent",
        dialogMessage: """One liner user agent string,
e.g.
Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Ubuntu Chromium/37.0.2062.94 Chrome/37.0.2062.94 Safari/537.36

you can get user agent strings from:
  https://gist.githubusercontent.com/pzb/b4b6f57144aea7827ae4/raw/cf847b76a142955b1410c8bcef3aabe221a63db1/user-agents.txt

Enter your custom user agent string below:""",
        text: "",
      ),
    ];
  }

  String preferenceUserAgent() {
    return getPreferenceValue(source.id, "USERAGENT");
  }
}

AllManga main(MSource source) {
  return AllManga(source: source);
}
