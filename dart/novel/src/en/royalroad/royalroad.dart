import 'package:mangayomi/bridge_lib.dart';
import 'dart:convert';

class RoyalRoadSource extends MProvider {
  RoyalRoadSource({required this.source});

  MSource source;

  final Client client = Client();

  @override
  bool get supportsLatest => true;

  @override
  Map<String, String> get headers => {
    "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.131 Safari/537.36",
    "referer": "$baseUrl",
  };

  @override
  String? get baseUrl => "https://royalroad.com";

  String addOption(String url, String key, String value) {
    if (value.isEmpty) return "";
    if (url.endsWith("?"))
      return "$key=$value";
    else
      return "&$key=$value";
  }

  Future<MPages> _getFilter(
    FilterList filterList,
    int page, [
    String? query,
  ]) async {
    final filters = filterList.filters;
    String url = "$baseUrl/fictions/search?";
    url += addOption(url, "page", "$page");
    url += addOption(url, "globalFilters", "false");
    if (query != null && query.isNotEmpty) {
      url += addOption(url, "title", query);
    }
    for (var filter in filters) {
      // if (filter.type == "TitleFilter" && filter.state.isNotEmpty)
      //   url += addOption(url, "title", filter.state);
      // else if (filter.type == "KeywordFilter" && filter.state.isNotEmpty)
      //   url += addOption(url, "keyword", filter.state);
      // else if (filter.type == "AuthorFilter" && filter.state.isNotEmpty)
      //   url += addOption(url, "author", filter.state);
      // NOTE: these above for some reason are broken, it always throws an error about trying to convert String to Bg or whatever
      if (filter.type == "GenreFilter" && filter.state.isNotEmpty) {
        for (final s in filter.state) {
          if (s.state == 0) continue;
          final key = s.state == 1 ? "tagsAdd" : "tagsRemove";
          url += addOption(url, key, s.value);
        }
      } else if (filter.type == "StatusFilter") {
        for (final s in filter.state) {
          if (!s.state) continue;
          url += addOption(url, "status", s.value);
        }
      } else if (filter.type == "TypeFilter") {
        url += addOption(url, "type", filter.values[filter.state].value);
      } else if (filter.type == "OrderByFilter") {
        url += addOption(
          url,
          "orderBy",
          filter.values[filter.state.index].value,
        );
        url += addOption(url, "dir", filter.state.ascending ? "asc" : "");
      }
    }
    final response = await client.get(Uri.parse(url), headers: headers);
    if (response.statusCode != 200) {
      throw Exception(
        "FAILED TO LOAD URL: $url IN _getFilter, report to discord with this error message",
      );
    }
    List<MElement> cards =
        parseHtml(response.body).select(".row.fiction-list-item") ?? [];
    List<MManga> mangaList = [];
    for (MElement card in cards) {
      String title =
          card.selectFirst(".fiction-title a")?.text?.trim() ?? "No Title";
      String mangaEndpoint =
          card.selectFirst(".fiction-title a")?.attr("href") ?? "";
      String imgUrl = card.selectFirst("img")?.attr("src") ?? "";
      List<MElement> tsElm =
          card.select(".label.label-default.label-sm.bg-blue-hoki") ?? [];
      String type = (tsElm.length > 0) ? tsElm.first.text?.trim() ?? "" : "";
      String status = (tsElm.length > 0) ? tsElm.last.text?.trim() ?? "" : "";
      List<String> genres = [];
      (card.select("span.tags a") ?? []).forEach((e) {
        genres.add(e.text?.trim() ?? "");
      });
      String pages = "";
      String views = "";
      String numberOfChapters = "";
      List<MElement> statsElm = card.select("div.row.stats > div > span") ?? [];
      if (statsElm.length >= 4) {
        pages = statsElm[statsElm.length - 3].text?.trim() ?? "";
        views = statsElm[statsElm.length - 2].text?.trim() ?? "";
        numberOfChapters = statsElm[statsElm.length - 1].text?.trim() ?? "";
      }
      if (genres.isEmpty) {
        (card.select(".tags a") ?? []).map((e) {
          genres.add(e.text?.trim() ?? "");
        });
      }
      String date = card.selectFirst("time")?.text?.trim() ?? "";
      String description =
          card.selectFirst("div[id*=description]")?.text?.trim() ?? "";
      mangaList.add(
        MManga(
          author: "$views | $pages",
          artist: "$views | $pages",
          genre: genres,
          imageUrl: imgUrl,
          link: "$baseUrl$mangaEndpoint",
          name: title,
          status: parseStatus(status, [
            {
              "ONGOING": 0,
              "COMPLETED": 1,
              "DROPPED": 2,
              "INACTIVE": 2,
              "HIATUS": 4,
              "STUB": 3,
            },
          ]),
          description:
              "${type.isNotEmpty ? '$type\n' : ''}${numberOfChapters.isNotEmpty ? '$numberOfChapters\n' : ''}${date.isNotEmpty ? '$date\n' : ''}\n$description"
                  .trim(),
          chapters: [],
        ),
      );
    }
    return MPages(mangaList, cards.isNotEmpty);
  }

  @override
  Future<MPages> getPopular(int page) async {
    return _getFilter(
      FilterList([
        SortFilter("OrderByFilter", "Order by", SortState(0, false), [
          SelectFilterOption("Popularity", "popularity"),
        ]),
      ]),
      page,
    );
  }

  @override
  Future<MPages> getLatestUpdates(int page) async {
    return _getFilter(
      FilterList([
        SortFilter("OrderByFilter", "Order by", SortState(0, false), [
          SelectFilterOption("Last Update", "last_update"),
        ]),
      ]),
      page,
    );
  }

  @override
  Future<MPages> search(String query, int page, FilterList filterList) async {
    return _getFilter(filterList, page, query);
  }

  @override
  Future<MManga> getDetail(String url) async {
    final response = await client.get(Uri.parse(url), headers: headers);
    if (response.statusCode != 200) {
      throw Exception(
        "FAILED TO LOAD URL: $url IN GETDETAIL, report to discord with this error message",
      );
    }
    List<MElement> rows =
        parseHtml(response.body).select("table > tbody> tr") ?? [];
    List<MChapter> chapters = [];
    for (MElement row in rows) {
      String chapterTitle = "";
      String chapterUrl = "";
      String date = "";
      List<MElement> cells = row.select("td") ?? [];
      chapterTitle = (cells.length > 0)
          ? cells.first.text?.trim() ?? ""
          : "No Title";
      chapterUrl =
          "$baseUrl${(cells.length > 0) ? cells.first.selectFirst("a")?.attr("href") ?? "" : ""}";
      date = (cells.length > 0)
          ? cells.last.selectFirst("time")?.attr("unixtime") ?? ""
          : "";
      if (date.isNotEmpty) date += "000";
      chapters.insert(
        0,
        MChapter(name: chapterTitle, url: chapterUrl, dateUpload: date),
      );
    }
    return MManga(chapters: chapters);
  }

  // For novel html content
  @override
  Future<String> getHtmlContent(String name, String url) async {
    final response = await client.get(Uri.parse(url), headers: headers);
    if (response.statusCode != 200) {
      throw Exception(
        "FAILED TO LOAD URL: $url IN getHtmlContent, report to discord with this error message",
      );
    }
    MDocument doc = parseHtml(response.body);
    MElement? elm = doc.selectFirst("div.chapter-inner");
    if (elm == null)
      throw Exception(
        "FAILED TO PARSE HTML CONTENT FROM URL: $url IN getHtmlContent, report to discord with this error message",
      );
    return cleanHtmlContent(elm.outerHtml ?? "");
  }

  // Clean html up for reader
  @override
  Future<String> cleanHtmlContent(String html) async {
    // tables arent supported so this is neat way to render them ig :3
    html = html.replaceAll(RegExp(r"<table.*?>"), "<hr><table>");
    html = html.replaceAll(RegExp(r"<tr.*?>"), "<pre><tr>");
    html = html.replaceAll(RegExp(r"</tr>"), "</tr></pre>");
    html = html.replaceAll(
      RegExp(r"<table.*?>|</table>|<tr.*?>|</tr>|<td.*?>|</td>"),
      "",
    );
    return " " + html; // idk for some reason the reader cuts first char
  }

  // For anime episode video list
  @override
  Future<List<MVideo>> getVideoList(String url) async {
    return [];
  }

  // For manga chapter pages
  @override
  Future<List<String>> getPageList(String url) async {
    return [];
  }

  @override
  List<dynamic> getFilterList() {
    return [
      HeaderFilter("Search Filters"),
      TextFilter("TitleFilter", "Title (DISABLED)"),
      TextFilter("KeywordFilter", "Keyword (title or description) (DISABLED)"),
      TextFilter("AuthorFilter", "Author (DISABLED)"),
      SeparatorFilter(),
      HeaderFilter("Genres and Tags"),
      GroupFilter("GenreFilter", "Genres", [
        TriStateFilter("Action", "action"),
        TriStateFilter("Adventure", "adventure"),
        TriStateFilter("Comedy", "comedy"),
        TriStateFilter("Contemporary", "contemporary"),
        TriStateFilter("Drama", "drama"),
        TriStateFilter("Fantasy", "fantasy"),
        TriStateFilter("Historical", "historical"),
        TriStateFilter("Horror", "horror"),
        TriStateFilter("Mystery", "mystery"),
        TriStateFilter("Psychological", "psychological"),
        TriStateFilter("Romance", "romance_main"),
        TriStateFilter("Satire", "satire"),
        TriStateFilter("Sci-fi", "sci_fi"),
        TriStateFilter("Short Story", "one_shot"),
        TriStateFilter("Thriller", "thriller"),
        TriStateFilter("Tragedy", "tragedy"),
      ]),
      GroupFilter("GenreFilter", "Additional Tags", [
        TriStateFilter("Anti-Hero Lead", "anti-hero_lead"),
        TriStateFilter("Anti-Villain Lead", "antivillain_lead"),
        TriStateFilter("Apocalypse", "apocalypse"),
        TriStateFilter("Artificial Intelligence", "artificial_intelligence"),
        TriStateFilter("Attractive Lead", "attractive_lead"),
        TriStateFilter("Chivalry", "chivalry"),
        TriStateFilter("Competing Love Interest", "competing_love"),
        TriStateFilter("Cozy", "cozy"),
        TriStateFilter("Crafting", "crafting"),
        TriStateFilter("Cultivation", "cultivation"),
        TriStateFilter("Cyberpunk", "cyberpunk"),
        TriStateFilter("Deck Building", "deck_building"),
        TriStateFilter("Dungeon Core", "dungeon_core"),
        TriStateFilter("Dungeon Crawler", "dungeon_crawler"),
        TriStateFilter("Dystopia", "dystopia"),
        TriStateFilter("Female Lead", "female_lead"),
        TriStateFilter("First Contact", "first_contact"),
        TriStateFilter("GameLit", "gamelit"),
        TriStateFilter("Gender Bender", "gender_bender"),
        TriStateFilter("Genetically Engineered", "genetically_engineered"),
        TriStateFilter("Grimdark", "grimdark"),
        TriStateFilter("Hard Sci-fi", "hard_sci-fi"),
        TriStateFilter("High Fantasy", "high_fantasy"),
        TriStateFilter("Kingdom Building", "kingdom_building"),
        TriStateFilter("Lesbian Romance", "lesbian_romance"),
        TriStateFilter("LitRPG", "litrpg"),
        TriStateFilter("Local Protagonist", "local_protagonist"),
        TriStateFilter("Low Fantasy", "low_fantasy"),
        TriStateFilter("Magic", "magic"),
        TriStateFilter("Magical Girl", "magical_girl"),
        TriStateFilter("Magitech", "magitech"),
        TriStateFilter("Male Gay Romance", "gay_romance"),
        TriStateFilter("Male Lead", "male_lead"),
        TriStateFilter("Martial Arts", "martial_arts"),
        TriStateFilter("Mecha", "mecha"),
        TriStateFilter("Modern Knowledge", "modern_knowledge"),
        TriStateFilter("Monster Evolution", "monster_evolution"),
        TriStateFilter("Multiple Lead Characters", "multiple_lead"),
        TriStateFilter("Multiple Lovers", "harem"),
        TriStateFilter("Mythos", "mythos"),
        TriStateFilter("Non-Human Lead", "non-human_lead"),
        TriStateFilter("Non-Humanoid Lead", "nonhumanoid_lead"),
        TriStateFilter("Otome", "otome"),
        TriStateFilter("Portal Fantasy / Isekai", "summoned_hero"),
        TriStateFilter("Post Apocalyptic", "post_apocalyptic"),
        TriStateFilter("Progression", "progression"),
        TriStateFilter("Reader Interactive", "reader_interactive"),
        TriStateFilter("Reincarnation", "reincarnation"),
        TriStateFilter("Romance Subplot", "romance"),
        TriStateFilter("Ruling Class", "ruling_class"),
        TriStateFilter("School Life", "school_life"),
        TriStateFilter("Secret Identity", "secret_identity"),
        TriStateFilter("Slice of Life", "slice_of_life"),
        TriStateFilter("Soft Sci-fi", "soft_sci-fi"),
        TriStateFilter("Space Opera", "space_opera"),
        TriStateFilter("Sports", "sports"),
        TriStateFilter("Steampunk", "steampunk"),
        TriStateFilter("Strategy", "strategy"),
        TriStateFilter("Strong Lead", "strong_lead"),
        TriStateFilter("Super Heroes", "super_heroes"),
        TriStateFilter("Supernatural", "supernatural"),
        TriStateFilter("Survival", "survival"),
        TriStateFilter("System Invasion", "system_invasion"),
        TriStateFilter(
          "Technologically Engineered",
          "technologically_engineered",
        ),
        TriStateFilter("Time Loop", "loop"),
        TriStateFilter("Time Travel", "time_travel"),
        TriStateFilter("Tower", "tower"),
        TriStateFilter("Urban Fantasy", "urban_fantasy"),
        TriStateFilter("Villainous Lead", "villainous_lead"),
        TriStateFilter("Virtual Reality", "virtual_reality"),
        TriStateFilter("War and Military", "war_and_military"),
        TriStateFilter("Wuxia", "wuxia"),
      ]),
      GroupFilter("GenreFilter", "Content Warnings", [
        TriStateFilter("AI-Assisted Content", "ai_assisted"),
        TriStateFilter("AI-Generated Content", "ai_generated"),
        TriStateFilter("Graphic Violence", "graphic_violence"),
        TriStateFilter("Profanity", "profanity"),
        TriStateFilter("Sensitive Content", "sensitive"),
        TriStateFilter("Sexual Content", "sexuality"),
      ]),
      SeparatorFilter(),
      HeaderFilter("Other Filters"),
      GroupFilter("StatusFilter", "Status", [
        CheckBoxFilter("All", "", null, true),
        CheckBoxFilter("Completed", "COMPLETED"),
        CheckBoxFilter("Dropped", "DROPPED"),
        CheckBoxFilter("Ongoing", "ONGOING"),
        CheckBoxFilter("Hiatus", "HIATUS"),
        CheckBoxFilter("Inactive", "INACTIVE"),
        CheckBoxFilter("Stub", "STUB"),
      ]),
      SelectFilter("TypeFilter", "Type", 0, [
        SelectFilterOption("All", ""),
        SelectFilterOption("Fan Fiction", "fanfiction"),
        SelectFilterOption("Original", "original"),
      ]),
      SeparatorFilter(),
      HeaderFilter("Sorting"),
      SortFilter("OrderByFilter", "Order by", SortState(0, false), [
        SelectFilterOption("Relevance", ""),
        SelectFilterOption("Popularity", "popularity"),
        SelectFilterOption("Average Rating", "rating"),
        SelectFilterOption("Last Update", "last_update"),
        SelectFilterOption("Release Date", "release_date"),
        SelectFilterOption("Followers", "followers"),
        SelectFilterOption("Number of Pages", "length"),
        SelectFilterOption("Views", "views"),
        SelectFilterOption("Title", "title"),
        SelectFilterOption("Author", "author"),
      ]),
    ];
  }

  @override
  List<dynamic> getSourcePreferences() {
    return [];
  }
}

RoyalRoadSource main(MSource source) {
  return RoyalRoadSource(source: source);
}
