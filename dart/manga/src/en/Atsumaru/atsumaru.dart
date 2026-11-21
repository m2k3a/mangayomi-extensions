import 'package:mangayomi/bridge_lib.dart';
import 'dart:convert';

class Atsumaru extends MProvider {
  Atsumaru({required this.source});

  MSource source;

  final Client client = Client();

  @override
  bool get supportsLatest => true;

  /// The site dropped `/api/explore/filteredView` and the HTML embedded
  /// `window.mangaPage` payload. It now uses a Typesense-backed search
  /// endpoint plus these JSON API routes (see the web client's Hono calls).
  final String apiUrl = "https://atsu.moe/api";
  static const String cdnUrl = "https://cdn.atsu.moe";
  static const int perPage = 40;
  static const sortMap = {
    "title": "title:asc",
    "trending": "trending:desc",
    "createdAt": "dateAdded:desc",
    "released": "releaseDate:desc",
    "topRated": "mbRating:desc",
  };
  static const genreData =
      "Action:39,Adult:46,Adventure:37,Boys Love:180,Comedy:6,Drama:31,"
      "Fantasy:36,Girls Love:4,Hentai:10,Historical:45,Horror:44,"
      "Martial Arts:29,"
      "Mystery:32,Psychological:18,Romance:9,Sci-Fi:1,Slice of Life:7,Smut:41,"
      "Supernatural:22,Thriller:19,Tragedy:5";
  static const tagData =
      "Full Color:57,Longstrip:93,Male Lead:58,Shounen:38,Seinen:8,"
      "Female Lead:59,Heterosexual:108,School Life:42,School:107,"
      "Based on a Web Novel:74,Shoujo:40,Josei:43,Mature:15,Magic:121,Harem:20,"
      "Yaoi:16,Isekai:94,Based on a Novel:75,Ecchi:21,Reincarnation:126,"
      "Love Triangle:125,High School:162,Adapted to Anime:166,Age Gap:106,"
      "Based on a Light Novel:76,Web Comic:428,Japan:225,Nobility:127,"
      "Revenge:227,Strong Male Lead:67,Royalty:128,Yuri:33,Demons:160,"
      "Time Skip:172,Handsome Male Lead:68,Female Harem:163,"
      "Beautiful Female Lead:72,Childhood Friends:97,Gore:262,"
      "Strong Female Lead:69,LGBTQ+:326,Working:248,Unrequited Love:226,"
      "College:257,Violence:830,Primarily Teen Cast:334,Misunderstandings:647,"
      "Murder:250,Bullying:235,Urban Fantasy:261,Mature Romance:241,"
      "Super Powers:236,Monsters:395,Time Travel:249,"
      "Yandere:315,Friendship:242,"
      "Tsundere:313,Cohabitation:228,Flashbacks:449,Game Elements:399,"
      "Coming of Age:117,Swordplay:337,Cultivation:363";

  final statusList = [
    {
      "Pending": 0,
      "Ongoing": 0,
      "Completed": 1,
      "Hiatus": 2,
      "Cancelled": 3,
      "Canceled": 3,
      "Unknown": 5,
    },
  ];

  String get baseUrl => source.baseUrl ?? "https://atsu.moe";

  Map<String, String> get headers => {
    "Accept": "*/*",
    "accept-language": "en-US,en;q=0.9,de;q=0.8,ja;q=0.7",
    "content-type": "application/json",
    "referer": "$baseUrl/",
  };

  /// Normalize bare, root-relative and fully qualified paths to the CDN.
  String imageUrl(String? path) {
    if (path == null || path.isEmpty) return "";
    var value = path.replaceFirst(RegExp(r'^/static/'), '');
    for (final prefix in ["$cdnUrl/static/", "$baseUrl/static/"]) {
      if (value.startsWith(prefix)) value = value.substring(prefix.length);
    }
    return value.startsWith("http") ? value : "$cdnUrl/static/$value";
  }

  String sortBy(String method) => sortMap[method] ?? "views:desc";

  List<String> stringList(dynamic value) =>
      value is List ? value.map((e) => e.toString()).toList() : [];

  String quoted(String value) => "`${value.replaceAll('`', r'\`')}`";

  List<dynamic> triStates(String data) => data.split(",").map((entry) {
    final i = entry.lastIndexOf(":");
    return TriStateFilter(entry.substring(0, i), entry.substring(i + 1));
  }).toList();

  List<dynamic> checkBoxes(Iterable<String> values) =>
      values.map((v) => CheckBoxFilter(v, v)).toList();

  /// Values of checked box filters, or included/excluded tri-state filters.
  List<dynamic> checked(dynamic state, [dynamic stateValue = true]) =>
      state is List
          ? state
              .where((f) => f.state == stateValue)
              .map((f) => f.value)
              .toList()
          : [];

  void tri(Map<String, dynamic> filters, dynamic state, String key) {
    if (state is! List) return;
    filters[key] = checked(state, 1);
    filters["exclude$key"] = checked(state, 2);
  }

  void addValues(List<String> parts, String field, dynamic value) {
    final values = stringList(value);
    if (values.isNotEmpty) {
      parts.add("$field:=[${values.map(quoted).join(',')}]");
    }
  }

  void addTags(
    List<String> parts,
    String field,
    dynamic included,
    dynamic excluded,
  ) {
    for (final value in stringList(included)) {
      parts.add("$field:=${quoted(value)}");
    }
    final excludedValues = stringList(excluded);
    if (excludedValues.isNotEmpty) {
      parts.add("$field:![${excludedValues.map(quoted).join(',')}]");
    }
  }

  /// Mirrors the `filter_by` expression built by the site before hitting
  /// `/collections/manga/documents/search`.
  String buildFilterBy(Map<String, dynamic> filters, bool showAdult) {
    final parts = <String>[];

    addTags(parts, "genreIds", filters["genres"], filters["excludeGenres"]);
    addTags(parts, "tagIds", filters["tags"], filters["excludeTags"]);
    addValues(parts, "type", filters["types"]);
    addValues(parts, "status", filters["status"]);
    final years = stringList(filters["years"]);
    if (years.isNotEmpty) {
      parts.add("releaseYear:=[${years.join(',')}]");
    }
    if (filters["officialTranslation"] == true) {
      parts.add("officialTranslation:=true");
    }

    // The site hides adult series unless NSFW is enabled in preferences.
    if (!showAdult) parts.add("isAdult:=false");
    parts.add("hidden:!=true");

    final method = filters["sortBy"]?.toString() ?? "popularity";
    if (method == "popularity") parts.add("views:>0");
    if (method == "topRated") parts.add("mbRating:>0");

    return parts.join(" && ");
  }

  Future<MPages> getMangaItems(
    int page,
    String method,
    String searchString,
    Map<String, dynamic> filters,
  ) async {
    final query = searchString.trim();
    final isSearch = query.isNotEmpty;

    final params = <String, String>{
      "q": isSearch ? query : "*",
      "query_by": "title,englishTitle,otherNames,authors,acronyms",
      "query_by_weights": "4,3,2,2,1",
      "num_typos": "4,3,2,1,0",
      "prefix": "true,true,true,true,false",
      "include_fields":
          "id,title,englishTitle,authors,poster,posterSmall,posterMedium,"
          "type,medium,isAdult,status,year,mbRating,popularity,dateAdded",
      "filter_by": buildFilterBy(filters, preferenceNsfwContent()),
      "page": "${page + 1}",
      "per_page": "$perPage",
    };
    if (isSearch) {
      params["infix"] = "off,off,fallback,off,off";
    } else {
      params["sort_by"] = sortBy(method);
    }

    final uri = Uri.parse(baseUrl)
        .resolve("/collections/manga/documents/search")
        .replace(queryParameters: params);
    final res = await client.get(uri, headers: headers);
    final data = json.decode(res.body);

    List<MManga> mangaList = [];
    for (final hit in data?["hits"] ?? []) {
      final item = hit["document"];
      mangaList.add(
        MManga()
          ..name = item["englishTitle"] ?? item["title"] ?? "No Title"
          ..imageUrl = imageUrl(item["poster"] ?? item["posterSmall"])
          ..link = "${item["id"]}",
      );
    }

    final found = data?["found"] ?? 0;
    final hasNext = (page + 1) * perPage < found;
    return MPages(mangaList, hasNext);
  }

  @override
  Future<MPages> getPopular(int page) async {
    return getMangaItems(page - 1, "popularity", "", {});
  }

  @override
  Future<MPages> getLatestUpdates(int page) async {
    return getMangaItems(page - 1, "released", "", {});
  }

  @override
  Future<MPages> search(String query, int page, FilterList filterList) async {
    final filters = <String, dynamic>{
      "search": query,
      "genres": [],
      "excludeGenres": [],
      "tags": [],
      "excludeTags": [],
      "types": [],
      "status": [],
      "years": [],
      "officialTranslation": false,
      "sortBy": "popularity",
    };

    for (final filter in filterList.filters) {
      switch (filter.type) {
        case "SearchFilter":
          if (filter.state.toString().isNotEmpty) {
            filters["search"] = filter.state.toString();
          }
          break;
        case "SortFilter":
          filters["sortBy"] = filter.values[filter.state].value;
          break;
        case "TypeFilter":
          filters["types"] = checked(filter.state);
          break;
        case "GenresFilter":
          tri(filters, filter.state, "genres");
          break;
        case "TagsFilter":
          tri(filters, filter.state, "tags");
          break;
        case "StatusFilter":
          filters["status"] = checked(filter.state);
          break;
        case "YearFilter":
          filters["years"] = checked(filter.state);
          break;
        case "TranslationsFilter":
          filters["officialTranslation"] = filter.state;
          break;
      }
    }

    if (query.isNotEmpty) filters["search"] = query;

    return getMangaItems(
      page - 1,
      filters["sortBy"].toString(),
      filters["search"].toString(),
      filters,
    );
  }

  @override
  Future<MManga> getDetail(String id) async {
    final res = await client.get(
      Uri.parse("$apiUrl/manga/page?id=${Uri.encodeComponent(id)}"),
      headers: headers,
    );
    final js = json.decode(res.body)?["mangaPage"] ?? {};

    final name = js["englishTitle"] ?? js["title"] ?? "No Title";
    final posterPath = js["poster"]?["image"];
    final otherNames = js["otherNames"];
    final alternativeTitles =
        otherNames is List && otherNames.isNotEmpty
            ? "\n\nAlternative Titles:\n" + otherNames.join("\n")
            : "";
    final description = "${js["synopsis"] ?? ""}" + alternativeTitles;
    final status = js["status"] ?? "Unknown";
    final authorsValue = js["authors"];
    final authors = authorsValue is List
        ? authorsValue.map((a) => a["name"]).join(", ")
        : "";
    final genresValue = js["genres"];
    final genres = genresValue is List
        ? genresValue.map((g) => g["name"]).toList()
        : <dynamic>[];
    final scanlators = <String, String>{
      for (final s in js["scanlators"] ?? []) "${s["id"]}": "${s["name"]}",
    };
    final chapters = await getChapters(id, scanlators);

    MManga manga = MManga();
    manga.name = name;
    manga.link = id;
    manga.imageUrl = imageUrl(posterPath);
    manga.genre = genres.map((g) => "$g").toList();
    manga.author = authors;
    manga.artist = authors;
    manga.chapters = chapters;
    manga.description = description;
    manga.status = parseStatus(status, statusList);
    return manga;
  }

  Future<List<MChapter>> getChapters(
    String id,
    Map<String, String> scanlators,
  ) async {
    List<MChapter> chapters = [];
    final res = await client.get(
      Uri.parse("$apiUrl/manga/allChapters?mangaId=${Uri.encodeComponent(id)}"),
      headers: headers,
    );
    final chaps = json.decode(res.body)?["chapters"] ?? [];
    for (final chap in chaps) {
      chapters.add(
        MChapter()
          ..name = chap["title"] ?? "Chapter ${chap["number"] ?? ""}"
          ..url = "$id&chapterId=${chap["id"]}"
          ..dateUpload = "${chap["createdAt"]}"
          ..description = "${chap["pageCount"] ?? 0} Pages"
          ..scanlator = scanlators["${chap["scanlationMangaId"]}"] ?? "Unknown",
      );
    }
    return chapters;
  }

  @override
  Future<List<Map<String, dynamic>>> getPageList(String url) async {
    List<Map<String, dynamic>> images = [];
    final res = await client.get(
      Uri.parse("$apiUrl/read/chapter?mangaId=$url"),
      headers: headers,
    );
    final pages = json.decode(res.body)?["readChapter"]?["pages"] ?? [];
    for (final page in pages) {
      images.add({"url": imageUrl(page["image"])});
    }
    return images;
  }

  @override
  List<dynamic> getFilterList() {
    return [
      TextFilter("SearchFilter", "Search..."),
      SelectFilter("SortFilter", "Order By", 0, [
        SelectFilterOption("Popularity", "popularity"),
        SelectFilterOption("Title", "title"),
        SelectFilterOption("Trending", "trending"),
        SelectFilterOption("Date Added", "createdAt"),
        SelectFilterOption("Release Date", "released"),
        SelectFilterOption("Top Rated", "topRated"),
      ]),
      SeparatorFilter(),
      GroupFilter(
        "TypeFilter",
        "Manga Type",
        checkBoxes(["Manga", "Manhwa", "Manhua", "OEL", "Other"]),
      ),
      GroupFilter("GenresFilter", "Genres", triStates(genreData)),
      GroupFilter("TagsFilter", "Popular Tags", triStates(tagData)),
      SeparatorFilter(),
      GroupFilter(
        "StatusFilter",
        "Release Status",
        checkBoxes(["Ongoing", "Completed", "Hiatus", "Canceled"]),
      ),
      GroupFilter(
        "YearFilter",
        "Release Year",
        List.generate(57, (i) {
          final year = "${2026 - i}";
          return CheckBoxFilter(year, year);
        }),
      ),
      CheckBoxFilter("Only official translations", "TranslationsFilter"),
    ];
  }

  @override
  List<dynamic> getSourcePreferences() {
    return [
      ListPreference(
        key: "NsfwFilter",
        title: "Display NSFW content",
        summary: "",
        valueIndex: 0,
        entries: ["False", "True"],
        entryValues: ["0", "1"],
      ),
    ];
  }

  bool preferenceNsfwContent() {
    return getPreferenceValue(source.id ?? 0, "NsfwFilter") == "1";
  }
}

Atsumaru main(MSource source) {
  return Atsumaru(source: source);
}
