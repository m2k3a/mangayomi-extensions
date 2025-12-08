import 'package:mangayomi/bridge_lib.dart';
import 'dart:convert';

class Atsumaru extends MProvider {
  Atsumaru({required this.source});

  MSource source;

  final Client client = Client(source);
  
  @override
  Future<MPages> getMangaItems(int page, final method, String searchString, filters) async {
    List<MPages> mangaList = [];

    final body = {
      "filter": {
        "search": filters["search"] ?? searchString,
        "tags": filters["tags"] ?? [],
        "excludeTags": filters["excludeTags"] ?? [],
        "types": filters["types"] ?? [],
        "status": filters["status"] ?? [],
        "years": filters["years"] ?? [],
        "minChapters": filters["minChapters"],
        "hideBookmarked": filters["hideBookmarked"] ?? false,
        "officialTranslation": filters["officialTranslation"] ?? false,
        "showAdult": preferenceNsfwContent(),
        "sortBy": filters["sortBy"] ?? method,
      },
      "page": page,
    };
    print(body);
    final res = await client.post(
      Uri.parse("${source.apiUrl}/explore/filteredView"),
      headers: {
        "Accept": "*/*",
        "accept-language": "en-US,en;q=0.9,de;q=0.8,ja;q=0.7,es;q=0.6,nl;q=0.5",
        "content-type": "application/json",
        "referer": "https://atsu.moe/"
      },
      body: json.encode(body),
    );

    final jsonResponse = json.decode(res.body);
    final items = jsonResponse["items"];

    for (final item in items) {
      MManga manga = MManga();
      manga.name = item["title"];
      manga.imageUrl = "${source.baseUrl}/static/${item["image"]}";
      manga.link = item["id"];
      mangaList.add(manga);
    }
    body["page"] = page+1;
    final hasNextReq = await client.post(
      Uri.parse("${source.apiUrl}/explore/filteredView"),
      headers: {
        "Accept": "*/*",
        "accept-language": "en-US,en;q=0.9,de;q=0.8,ja;q=0.7,es;q=0.6,nl;q=0.5",
        "content-type": "application/json",
        "referer": "https://atsu.moe/"
      },
      body: json.encode(body),
    );
    
    final hasNext = json.decode(hasNextReq.body)["items"].isEmpty;
    
    return MPages(mangaList, !hasNext);
  }

  @override
  Future<MPages> getPopular(int page) async {
    return getMangaItems(page, "popularity", "", {});
  }

  @override
  Future<MPages> getLatestUpdates(int page) async {
    return getMangaItems(page, "released", "", {});
  }

   @override
  Future<MPages> search(String query, int page, FilterList filterList) async {
    final filters = filterList.filters;

    final selectedFilters = {
      "search": query,
      "tags": [],
      "excludeTags": [],
      "types": [],
      "status": [],
      "years": [],
      "minChapters": null,
      "hideBookmarked": false,
      "officialTranslation": false,
      "sortBy": "popularity",
    };

    for (var filter in filters) {
      if (filter.type  == "SeparatorFilter") continue;
      
      if (filter.type == "SearchFilter") {
        if (filter.state.isNotEmpty) {
          selectedFilters["search"] = filter.state.toString();
        }
      } else if (filter.type == "SortFilter") {
        selectedFilters["sortBy"] = filter.values[filter.state].value ?? "";
      } else if (filter.type == "TypeFilter") {
        final types = [];
        for (var type in filter.state ?? []) {
          if (type.state == true) {
            types.add(type.value);
          }
        }
        selectedFilters["types"] = types;
      } else if (filter.type == "GenresFilter") {
        final tags = [];
        final excludeTags = [];
        for (var genre in filter.state ?? []) {
          if (genre.state == 1) {
            tags.add(genre.value);
          } else if (genre.state == 2) {
            excludeTags.add(genre.value);
          }
        }
        selectedFilters["tags"] = tags;
        selectedFilters["excludeTags"] = excludeTags;
      } else if (filter.type == "StatusFilter") {
        final status = [];
        for (var s in filter.state ?? []) {
          if (s.state == true) {
            status.add(s.value);
          }
        }
        selectedFilters["status"] = status;
      } else if (filter.type == "YearFilter") {
        final years = [];
        for (var y in filter.state ?? []) {
          if (y.state == true) {
            years.add(y.value);
          }
        }
        selectedFilters["years"] = years;
      } else if (filter.type == "TranslationsFilter") {
        selectedFilters["officialTranslation"] = filter.state;
      }
    }
    
    if (query.isNotEmpty) {
      selectedFilters["search"] = query;
    }

    return getMangaItems(page-1, selectedFilters["sortBy"], query, selectedFilters);
  }

  @override
  Future<MManga> getDetail(String id) async {
  final statusList = [{
    "Pending": 0,
    "Ongoing": 0,
    "Completed": 1,
    "Hiatus": 2,
    "Cancelled": 3,
    "Unknown": 5,
  }];

  final res = await client.get(Uri.parse("${source.baseUrl}/manga/$id"), 
  headers: {
    "Accept": "*/*",
    "accept-language": "en-US,en;q=0.9,de;q=0.8,ja;q=0.7,es;q=0.6,nl;q=0.5,ar;q=0.4,ru;q=0.3,fr;q=0.2",
    "referer": "https://atsu.moe/"
  });
  final doc = parseHtml(res.body);
  
  final contentJson = doc.select("head > script")[1].text;
  final json =  json.decode(contentJson.replaceAll("window.mangaPage = ", "").replaceAll(";", ""))["mangaPage"];  
  
  final name = json["title"];
  final imageUrl = json["poster"]["image"];
  final description = json["synopsis"];
  final status = json["status"];
  final authors = json["authors"].map((author) => author["name"]);
  final genres = json["tags"].map((tag) => tag["name"]);
  final chapters = await getChapters(id, 0);
  
  MManga manga = MManga();
  
  manga.name = name;
  manga.link = id;
  manga.imageUrl = "${source.baseUrl}/static/$imageUrl";
  manga.genre = "$genres".replaceAll(RegExp(r'[()]'), '').split(", ");
  manga.author = "$authors".replaceAll(RegExp(r'[()]'), '');
  manga.chapters = chapters;
  manga.description = description;
  manga.status = parseStatus("pending", statusList);

  return manga;
  }

  Future<List<MChapter>> getChapters(String id, int page) async {
  List<MChapter> chapters = [];
  final currentPage = page;

  final res = await client.get(
    Uri.parse("${source.apiUrl}/manga/chapters?id=$id&filter=all&sort=desc&page=$currentPage"),
    headers: {
      "Accept": "*/*",
      "accept-language": "en-US,en;q=0.9,de;q=0.8,ja;q=0.7,es;q=0.6,nl;q=0.5,ar;q=0.4,ru;q=0.3,fr;q=0.2",
      "referer": "https://atsu.moe/"
    },
  );

  final jsonData = json.decode(res.body);

  final maxPageCount = jsonData["pages"] ?? 1;
  final chaps = jsonData["chapters"] ?? [];

  for (final chap in chaps) {
    final chapter = MChapter()
      ..name = chap["title"]
      ..url = "$id&chapterId=${chap["id"]}"
      ..dateUpload = "${isoToUnix(chap["createdAt"])}"
      ..scanlator = "${chap['pageCount']} Pages";

    chapters.add(chapter);
  }

  if (chaps.isEmpty || currentPage >= maxPageCount) {
    return chapters;
  }

  final nextPageChapters = await getChapters(id, currentPage + 1);
  chapters.addAll(nextPageChapters);

  return chapters;
}


  @override
  Future<List<Map<String, dynamic>>> getPageList(String url) async {
    List<Map<String, dynamic>> images = [];
    final res = await client.get(Uri.parse("${source.apiUrl}/read/chapter?mangaId=$url"));
    final json = json.decode(res.body);

    final imageObjects = json["readChapter"]["pages"];

    for (final imageObject in imageObjects) {
      images.add({
        "url": "${source.baseUrl}${imageObject["image"]}"
      });
    }
    return images;
  }

  int isoToUnix(String isoString) {
    final dateTime = DateTime.parse(isoString);
    return dateTime.toUtc().millisecondsSinceEpoch;
  }


  @override
  List<dynamic> getFilterList() {
    return [
      TextFilter("SearchFilter", "Search..."),
      SelectFilter("SortFilter", "Order By", 0, [
        SelectFilterOption("Popularity", "popularity"),
        SelectFilterOption("Alphabetically", "title"),
        SelectFilterOption("Trending", "trending"),
        SelectFilterOption("Date Added", "createdAt"),
        SelectFilterOption("Release Date", "released"),
      ]),
      SeparatorFilter(),
      GroupFilter("TypeFilter", "Manga Type", [
        CheckBoxFilter("Manga", "Manga"),
        CheckBoxFilter("Manhua", "Manhua"),
        CheckBoxFilter("Manhwa", "Manhwa"),
        CheckBoxFilter("OEL", "OEL"),
      ]),
      GroupFilter("GenresFilter", "General Filters", [
        TriStateFilter("Action", "n_"),
        TriStateFilter("Adult", "Ed"),
        TriStateFilter("Adventure", "0i"),
        TriStateFilter("Comedy", "sz"),
        TriStateFilter("Doujinshi", "1M"),
        TriStateFilter("Drama", "Cq"),
        TriStateFilter("Ecchi", "ZK"),
        TriStateFilter("Fantasy", "Lu"),
        TriStateFilter("Gender Bender", "Ug"),
        TriStateFilter("Harem", "GV"),
        TriStateFilter("Hentai", "y3"),
        TriStateFilter("Historical", "Sa"),
        TriStateFilter("Horror", "Xk"),
        TriStateFilter("Isekai", "p7"),
        TriStateFilter("Josei", "3X"),
        TriStateFilter("Lolicon", "KY"),
        TriStateFilter("Martial Arts", "d0"),
        TriStateFilter("Mature", "tK"),
        TriStateFilter("Mecha", "m9"),
        TriStateFilter("Mystery", "Q8"),
        TriStateFilter("Other", "Tw"),
        TriStateFilter("Psychological", "O-"),
        TriStateFilter("Romance", "9Q"),
        TriStateFilter("School Life", "JH"),
        TriStateFilter("Sci-Fi", "hr"),
        TriStateFilter("Sci-fi", "w_"),
        TriStateFilter("Seinen", "ce"),
        TriStateFilter("Shotacon", "bl"),
        TriStateFilter("Shoujo", "lk"),
        TriStateFilter("Shoujo Ai", "kK"),
        TriStateFilter("Shounen", "vl"),
        TriStateFilter("Shounen Ai", "IA"),
        TriStateFilter("Slice of Life", "I1"),
        TriStateFilter("Smut", "ta"),
        TriStateFilter("Sports", "Hf"),
        TriStateFilter("Supernatural", "Ad"),
        TriStateFilter("Thriller", "Lb"),
        TriStateFilter("Tragedy", "Mv"),
        TriStateFilter("Yaoi", "CJ"),
        TriStateFilter("Yuri", "bz"),
      ]),
      SeparatorFilter(),
      GroupFilter("StatusFilter", "Release Status", [
        CheckBoxFilter("Ongoing", "Ongoing"),
        CheckBoxFilter("Completed", "Completed"),
        CheckBoxFilter("Hiatus", "Hiatus"),
        CheckBoxFilter("Canceled", "Canceled"),
      ]),
      GroupFilter("YearFilter", "Release Year", [
        CheckBoxFilter("2026", "2026"),
        CheckBoxFilter("2025", "2025"),
        CheckBoxFilter("2024", "2024"),
        CheckBoxFilter("2023", "2023"),
        CheckBoxFilter("2022", "2022"),
        CheckBoxFilter("2021", "2021"),
        CheckBoxFilter("2020", "2020"),
        CheckBoxFilter("2019", "2019"),
        CheckBoxFilter("2018", "2018"),
        CheckBoxFilter("2017", "2017"),
        CheckBoxFilter("2016", "2016"),
        CheckBoxFilter("2015", "2015"),
        CheckBoxFilter("2014", "2014"),
        CheckBoxFilter("2013", "2013"),
        CheckBoxFilter("2012", "2012"),
        CheckBoxFilter("2011", "2011"),
        CheckBoxFilter("2010", "2010"),
        CheckBoxFilter("2009", "2009"),
        CheckBoxFilter("2008", "2008"),
        CheckBoxFilter("2007", "2007"),
        CheckBoxFilter("2006", "2006"),
        CheckBoxFilter("2005", "2005"),
        CheckBoxFilter("2004", "2004"),
        CheckBoxFilter("2003", "2003"),
        CheckBoxFilter("2002", "2002"),
        CheckBoxFilter("2001", "2001"),
        CheckBoxFilter("2000", "2000"),
        CheckBoxFilter("1999", "1999"),
        CheckBoxFilter("1998", "1998"),
        CheckBoxFilter("1997", "1997"),
        CheckBoxFilter("1996", "1996"),
        CheckBoxFilter("1995", "1995"),
        CheckBoxFilter("1994", "1994"),
        CheckBoxFilter("1993", "1993"),
        CheckBoxFilter("1992", "1992"),
        CheckBoxFilter("1991", "1991"),
        CheckBoxFilter("1990", "1990"),
        CheckBoxFilter("1989", "1989"),
        CheckBoxFilter("1988", "1988"),
        CheckBoxFilter("1987", "1987"),
        CheckBoxFilter("1986", "1986"),
        CheckBoxFilter("1985", "1985"),
        CheckBoxFilter("1984", "1984"),
        CheckBoxFilter("1983", "1983"),
        CheckBoxFilter("1982", "1982"),
        CheckBoxFilter("1981", "1981"),
        CheckBoxFilter("1980", "1980"),
        CheckBoxFilter("1979", "1979"),
        CheckBoxFilter("1978", "1978"),
        CheckBoxFilter("1977", "1977"),
        CheckBoxFilter("1976", "1976"),
        CheckBoxFilter("1975", "1975"),
        CheckBoxFilter("1974", "1974"),
        CheckBoxFilter("1973", "1973"),
        CheckBoxFilter("1972", "1972"),
        CheckBoxFilter("1971", "1971"),
        CheckBoxFilter("1970", "1970"),
      ]),
       CheckBoxFilter("Only show official tanslations", "TranslationsFilter"),
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
        entryValues: [0, 1],
      ),
    ];
  }

  bool preferenceNsfwContent() {
    return getPreferenceValue(source.id, "NsfwFilter") == "2";
  } 
}

Atsumaru main(MSource source) {
  return Atsumaru(source:source);
}
