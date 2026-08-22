import 'package:mangayomi/bridge_lib.dart';

import 'dart:convert';

class AnimePahe extends MProvider {
  AnimePahe(this.source);

  final MSource source;

  final Client client = Client();

  @override
  String get baseUrl => getPreferenceValue(source.id, "preferred_domain_new2");

  @override
  Map<String, String> get headers => {'Referer': '$baseUrl/'};

  @override
  Future<MPages> getPopular(int page) async {
    return await getLatestUpdates(page);
  }

  @override
  Future<MPages> getLatestUpdates(int page) async {
    final res = (await client.get(
      Uri.parse("$baseUrl/api?m=airing&page=$page"),
      headers: headers,
    )).body;
    final jsonResult = json.decode(res);
    final hasNextPage = jsonResult["current_page"] < jsonResult["last_page"];
    List<MManga> animeList = [];
    for (var item in jsonResult["data"]) {
      MManga anime = MManga();
      anime.name = item["anime_title"];
      anime.imageUrl = item["snapshot"];
      final animeId = item["id"] ?? item["anime_id"];
      final session = item["anime_session"] ?? item["session"] ?? "";
      anime.link =
          "/anime/$session?anime_id=$animeId&name=${Uri.encodeComponent(item["anime_title"] ?? "")}";
      anime.artist = item["fansub"];
      animeList.add(anime);
    }
    return MPages(animeList, hasNextPage);
  }

  @override
  Future<MPages> search(String query, int page, FilterList filterList) async {
    final res = (await client.get(
      Uri.parse("$baseUrl/api?m=search&l=8&q=${Uri.encodeComponent(query)}"),
      headers: headers,
    )).body;
    final jsonResult = json.decode(res);
    List<MManga> animeList = [];
    for (var item in jsonResult["data"]) {
      MManga anime = MManga();
      anime.name = item["title"];
      anime.imageUrl = item["poster"];
      final animeId = item["id"] ?? item["anime_id"];
      final session = item["session"] ?? "";
      anime.link =
          "/anime/$session?anime_id=$animeId&name=${Uri.encodeComponent(item["title"] ?? "")}";
      animeList.add(anime);
    }
    return MPages(animeList, false);
  }

  @override
  Future<MManga> getDetail(String url) async {
    final statusList = [
      {"Currently Airing": 0, "Finished Airing": 1},
    ];
    MManga anime = MManga();
    String? id;
    if (url.contains("anime_id=")) {
      id = substringBefore(substringAfter(url, "anime_id="), "&");
    }
    String name = "";
    if (url.contains("name=")) {
      name = Uri.decodeComponent(substringAfter(url, "name="));
    }

    String session = "";
    if (url.startsWith("/anime/")) {
      session = substringBefore(substringAfter(url, "/anime/"), "?");
    }

    if (session.isEmpty) {
      session = await getSession(name, id ?? "");
    }

    var res = (await client.get(
      Uri.parse("$baseUrl/anime/$session?anime_id=$id"),
      headers: headers,
    )).body;

    if (res.contains("404 Not Found") ||
        res.contains("Page Not Found") ||
        res.trim().isEmpty) {
      session = await getSession(name, id ?? "");
      res = (await client.get(
        Uri.parse("$baseUrl/anime/$session?anime_id=$id"),
        headers: headers,
      )).body;
    }

    final document = parseHtml(res);
    final status =
        (document.xpathFirst('//div/p[contains(text(),"Status:")]/text()') ??
                "")
            .replaceAll("Status:\n", "")
            .trim();
    anime.status = parseStatus(status, statusList);

    final titleElem = document.selectFirst("div.title-wrapper > h1 > span");
    if (titleElem != null) {
      anime.name = titleElem.text;
    } else if (name.isNotEmpty) {
      anime.name = name;
    }

    anime.author =
        (document.xpathFirst('//div/p[contains(text(),"Studio:")]/text()') ??
                "")
            .replaceAll("Studio:\n", "")
            .trim();
    final posterElem = document.selectFirst("div.anime-poster a");
    if (posterElem != null) {
      anime.imageUrl = posterElem.attr("href");
    }
    anime.genre = xpath(
      res,
      '//*[contains(@class,"anime-genre")]/ul/li/text()',
    );
    final synonyms =
        (document.xpathFirst('//div/p[contains(text(),"Synonyms:")]/text()') ??
                "")
            .replaceAll("Synonyms:\n", "")
            .trim();
    final summaryElem = document.selectFirst("div.anime-summary");
    anime.description = summaryElem?.text ?? "";
    if (synonyms.isNotEmpty) {
      anime.description += "\n\n$synonyms";
    }
    final epUrl = "$baseUrl/api?m=release&id=$session&sort=episode_desc&page=1";
    final resEp = (await client.get(Uri.parse(epUrl), headers: headers)).body;
    final episodes = await recursivePages(epUrl, resEp, session);

    anime.chapters = episodes;
    return anime;
  }

  Future<List<MChapter>> recursivePages(
    String url,
    String res,
    String session,
  ) async {
    final jsonResult = json.decode(res);
    final page = jsonResult["current_page"];
    final hasNextPage = page < jsonResult["last_page"];

    List<MChapter> animeList = [];

    for (var item in jsonResult["data"]) {
      MChapter episode = MChapter();
      episode.name = "Episode ${item["episode"]}";
      episode.url = "/play/$session/${item["session"]}";
      episode.dateUpload = parseDates(
        [item["created_at"]],
        "yyyy-MM-dd HH:mm:ss",
        "en",
      )[0];
      animeList.add(episode);
    }
    if (hasNextPage) {
      final newUrl = "${substringBeforeLast(url, "&page=")}&page=${page + 1}";
      final newRes = (await client.get(
        Uri.parse(newUrl),
        headers: headers,
      )).body;

      final nextPages = await recursivePages(newUrl, newRes, session);
      animeList.addAll(nextPages);
    }
    return animeList;
  }

  Future<String> getSession(String title, String animeId) async {
    if (title.isNotEmpty) {
      final cleanTitle = normalizeSearchQuery(title);
      final searchRes = (await client.get(
        Uri.parse("$baseUrl/api?m=search&q=${Uri.encodeComponent(cleanTitle)}"),
        headers: headers,
      )).body;

      try {
        final jsonResult = json.decode(searchRes);
        for (var item in jsonResult["data"] ?? []) {
          if (animeId.isNotEmpty && item["id"]?.toString() == animeId) {
            return item["session"] ?? "";
          }
          if (cleanTitle.isNotEmpty &&
              normalizeTitle(item["title"] ?? "") ==
                  normalizeTitle(cleanTitle)) {
            return item["session"] ?? "";
          }
        }
        if ((jsonResult["data"] as List?)?.isNotEmpty ?? false) {
          return jsonResult["data"][0]["session"] ?? "";
        }
      } catch (_) {}
    }

    try {
      final noRedirect = Client(
        source,
        json.encode({"followRedirects": false, "useDartHttpClient": true}),
      );

      final res = await noRedirect.get(
        Uri.parse("$baseUrl/a/$animeId"),
        headers: headers,
      );

      final location =
          "https://${substringAfterLast(getMapValue(json.encode(res.headers), "location"), "https://")}";

      if (location.contains("/anime/")) {
        return substringAfterLast(location, '/');
      }
    } catch (_) {}

    return "";
  }

  String normalizeSearchQuery(String raw) {
    return raw
        .replaceAll(RegExp(r'[^a-zA-Z0-9\s]+'), '')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
  }

  String normalizeTitle(String raw) {
    return raw.toLowerCase().replaceAll(RegExp(r'[^a-z0-9]+'), '').trim();
  }

  @override
  Future<List<MVideo>> getVideoList(String url) async {
    final playUrl = url.startsWith("http") ? url : "$baseUrl$url";
    final res = await client.get(Uri.parse(playUrl), headers: headers);
    final document = parseHtml(res.body);
    final downloadLinks = document.select("div#pickDownload > a");
    final buttons = document.select("div#resolutionMenu > button");
    List<MVideo> videos = [];

    final String userAgent =
        getMapValue(json.encode(res.request.headers), "user-agent").isNotEmpty
        ? getMapValue(json.encode(res.request.headers), "user-agent")
        : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    final bool useHlsOnly =
        getPreferenceValue(source.id, "preffered_link_type_1") ?? false;

    // 1. Try Direct MP4 extraction first
    if (!useHlsOnly) {
      for (var i = 0; i < buttons.length; i++) {
        try {
          final btn = buttons[i];
          final quality = btn.text;
          if (i >= downloadLinks.length) continue;
          final rawPaheLink = downloadLinks[i].attr("href");
          if (rawPaheLink.isEmpty) continue;

          final paheUrl = rawPaheLink.startsWith("http")
              ? rawPaheLink
              : "https://$rawPaheLink";
          final finalPaheUrl = paheUrl.endsWith("/i") ? paheUrl : "$paheUrl/i";

          final noRedirectClient = Client(
            source,
            json.encode({"followRedirects": false, "useDartHttpClient": true}),
          );
          final kwikHeaders = (await noRedirectClient.get(
            Uri.parse(finalPaheUrl),
            headers: {"Referer": "$baseUrl/"},
          )).headers;

          String kwikLocation = getMapValue(
            json.encode(kwikHeaders),
            "location",
          );
          if (kwikLocation.isEmpty) {
            kwikLocation = getMapValue(json.encode(kwikHeaders), "Location");
          }
          if (kwikLocation.isEmpty) continue;
          final kwikUrl =
              "https://${substringAfterLast(kwikLocation, "https://")}";

          final reskwik = await client.get(
            Uri.parse(kwikUrl),
            headers: {
              "Referer": "https://kwik.cx/",
              "Origin": "https://kwik.cx",
              "User-Agent": userAgent,
            },
          );

          final matches = RegExp(r'\("(\S+)",\d+,"(\S+)",(\d+),(\d+)')
              .firstMatch(reskwik.body);

          if (matches != null) {
            final token = decrypt(
              matches.group(1)!,
              matches.group(2)!,
              int.parse(matches.group(3)!),
              int.parse(matches.group(4)!),
            );
            final urlMatch = RegExp(r'action="([^"]+)"').firstMatch(token);
            final tokMatch = RegExp(r'value="([^"]+)"').firstMatch(token);

            if (urlMatch != null && tokMatch != null) {
              final postUrl = urlMatch.group(1)!;
              final tok = tokMatch.group(1)!;
              var code = 419;
              var tries = 0;
              String location = "";

              while (code != 302 && tries < 10) {
                String cookie = getMapValue(
                  json.encode(res.request.headers),
                  "cookie",
                );
                String kwikSetCookie = getMapValue(
                  json.encode(reskwik.headers),
                  "set-cookie",
                );
                if (kwikSetCookie.isEmpty) {
                  kwikSetCookie = getMapValue(
                    json.encode(reskwik.headers),
                    "Set-Cookie",
                  );
                }
                if (kwikSetCookie.isNotEmpty) {
                  cookie += "; ${kwikSetCookie.replaceAll("path=/;", "")}";
                }
                final resNo =
                    await Client(
                      source,
                      json.encode({
                        "followRedirects": false,
                        "useDartHttpClient": true,
                      }),
                    ).post(
                      Uri.parse(postUrl),
                      headers: {
                        "referer": reskwik.request.url.toString(),
                        "origin": "https://kwik.cx",
                        "cookie": cookie,
                        "user-agent": userAgent,
                      },
                      body: {"_token": tok},
                    );
                code = resNo.statusCode;
                tries++;
                location = getMapValue(json.encode(resNo.headers), "location");
                if (location.isEmpty) {
                  location = getMapValue(
                    json.encode(resNo.headers),
                    "Location",
                  );
                }
              }
              if (location.isNotEmpty) {
                MVideo video = MVideo();
                video
                  ..url = location
                  ..originalUrl = location
                  ..quality = quality
                  ..headers = {
                    "Referer": "https://kwik.cx/",
                    "Origin": "https://kwik.cx",
                    "User-Agent": userAgent,
                  };
                videos.add(video);
              }
            }
          }
        } catch (_) {}
      }
    }

    // 2. Fallback to HLS extraction if MP4 returned no videos or if useHlsOnly is true
    if (videos.isEmpty) {
      for (var i = 0; i < buttons.length; i++) {
        try {
          final btn = buttons[i];
          final kwikLink = btn.attr("data-src");
          final quality = btn.text;
          if (kwikLink.isEmpty) continue;

          final ress = await client.get(
            Uri.parse(kwikLink),
            headers: {
              "Referer": "$baseUrl/",
              "Origin": "https://kwik.cx",
              "User-Agent": userAgent,
            },
          );

          final scriptElements = xpath(
            ress.body,
            '//script[contains(text(),"eval(function")]/text()',
          );
          if (scriptElements.isEmpty) continue;

          final script = substringAfterLast(
            scriptElements.first,
            "eval(function(",
          );
          final unpacked = unpackJsAndCombine("eval(function($script");
          final videoUrl = substringBefore(
            substringAfter(unpacked, "const source=\\'"),
            "\\';",
          );

          if (videoUrl.isNotEmpty) {
            MVideo video = MVideo();
            video
              ..url = videoUrl
              ..originalUrl = videoUrl
              ..quality = "$quality (HLS)"
              ..headers = {
                "Referer": ress.request.url.toString(),
                "Origin": "https://kwik.cx",
                "User-Agent": userAgent,
              };
            videos.add(video);
          }
        } catch (_) {}
      }
    }

    return sortVideos(videos);
  }

  String decrypt(String fullString, String key, int v1, int v2) {
    Map<String, int> keyIndexMap = {};
    for (int i = 0; i < key.length; i++) {
      keyIndexMap[key[i]] = i;
    }

    StringBuffer sb = StringBuffer();
    int i = 0;
    if (v2 >= key.length) return "";
    String toFind = key[v2];

    while (i < fullString.length) {
      int nextIndex = fullString.indexOf(toFind, i);
      if (nextIndex == -1) break;

      int val = 0;
      for (int j = i; j < nextIndex; j++) {
        val = val * v2 + (keyIndexMap[fullString[j]] ?? 0);
      }

      i = nextIndex + 1;
      sb.writeCharCode(val - v1);
    }

    return sb.toString();
  }

  List<MVideo> sortVideos(List<MVideo> videos) {
    String quality = getPreferenceValue(source.id, "preferred_quality");
    String preferredAudio = getPreferenceValue(
      source.id,
      "preferred_audio_1",
    ); // get user's audio preference

    videos.sort((MVideo a, MVideo b) {
      // Prioritize audio first
      int audioMatchA = a.quality.contains(preferredAudio) ? 1 : 0;
      int audioMatchB = b.quality.contains(preferredAudio) ? 1 : 0;
      if (audioMatchA != audioMatchB) {
        return audioMatchB - audioMatchA;
      }

      // Quality prioritized next
      int qualityMatchA = a.quality.contains(quality) ? 1 : 0;
      int qualityMatchB = b.quality.contains(quality) ? 1 : 0;
      if (qualityMatchA != qualityMatchB) {
        return qualityMatchB - qualityMatchA;
      }

      try {
        final regex = RegExp(r'(\d+)p');
        final matchA = regex.firstMatch(a.quality);
        final matchB = regex.firstMatch(b.quality);
        final int qualityNumA = int.tryParse(matchA?.group(1) ?? '0') ?? 0;
        final int qualityNumB = int.tryParse(matchB?.group(1) ?? '0') ?? 0;
        return qualityNumB - qualityNumA;
      } catch (_) {
        return qualityMatchB - qualityMatchA;
      }
    });

    return videos;
  }

  @override
  List<dynamic> getSourcePreferences() {
    return [
      ListPreference(
        key: "preferred_domain_new2",
        title: "Preferred domain",
        summary: "",
        valueIndex: 0,
        entries: ["animepahe.pw", "animepahe.com"],
        entryValues: ["https://animepahe.pw", "https://animepahe.com"],
      ),
      SwitchPreferenceCompat(
        key: "preffered_link_type_1",
        title: "Use HLS links only",
        summary: "Enable this if you are having issues with direct MP4 links.",
        value: false,
      ),
      ListPreference(
        key: "preferred_quality",
        title: "Preferred Quality",
        summary: "",
        valueIndex: 0,
        entries: ["1080p", "720p", "360p"],
        entryValues: ["1080", "720", "360"],
      ),
      ListPreference(
        key: "preferred_audio_1",
        title: "Preferred Audio",
        summary: "Select your preferred audio language (Japanese or English).",
        valueIndex: 0,
        entries: ["Japanese", "English"],
        entryValues: ["jpn", "eng"],
      ),
    ];
  }
}

AnimePahe main(MSource source) {
  return AnimePahe(source);
}
