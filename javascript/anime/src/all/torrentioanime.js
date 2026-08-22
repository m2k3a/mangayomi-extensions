const mangayomiSources = [{
    "name": "Torrentio Anime (Torrent / Debrid)",
    "lang": "all",
    "baseUrl": "https://torrentio.strem.fun",
    "apiUrl": "",
    "iconUrl": "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/main/javascript/icon/all.torrentio.png",
    "typeSource": "torrent",
    "isManga": false,
    "itemType": 1,
    "version": "0.0.3",
    "pkgPath": "anime/src/all/torrentioanime.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    anilistQuery() {
        return `
            query (
                $page: Int,
                $perPage: Int,
                $sort: [MediaSort],
                $search: String,
                $genres: [String],
                $year: String,
                $seasonYear: Int,
                $season: MediaSeason,
                $format: [MediaFormat],
                $status: [MediaStatus]
            ) {
                Page(page: $page, perPage: $perPage) {
                    pageInfo {
                        currentPage
                        hasNextPage
                    }
                    media(
                        type: ANIME,
                        sort: $sort,
                        search: $search,
                        status_in: $status,
                        genre_in: $genres,
                        startDate_like: $year,
                        seasonYear: $seasonYear,
                        season: $season,
                        format_in: $format,
                        isAdult: false
                    ) {
                        id
                        title {
                            romaji
                            english
                            native
                        }
                        coverImage {
                            extraLarge
                            large
                        }
                        description
                        status
                        tags {
                            name
                        }
                        genres
                        studios {
                            nodes {
                                name
                            }
                        }
                        countryOfOrigin
                        isAdult
                    }
                }
            }
        `.trim();
    }

    anilistLatestQuery() {
        const currentTimeInSeconds = Math.floor(Date.now() / 1000);
        return `
            query ($page: Int, $perPage: Int, $sort: [AiringSort]) {
              Page(page: $page, perPage: $perPage) {
                pageInfo {
                  currentPage
                  hasNextPage
                }
                airingSchedules(
                  airingAt_greater: 0,
                  airingAt_lesser: ${currentTimeInSeconds - 10000},
                  sort: $sort
                ) {
                  media {
                    id
                    title {
                      romaji
                      english
                      native
                    }
                    coverImage {
                      extraLarge
                      large
                    }
                    description
                    status
                    tags {
                      name
                    }
                    genres
                    studios {
                      nodes {
                        name
                      }
                    }
                    countryOfOrigin
                    isAdult
                  }
                }
              }
            }
        `.trim();
    }

    async makeGraphQLRequest(query, variables) {
        const res = await this.client.post("https://graphql.anilist.co", { "Content-Type": "application/json" }, {
            query,
            variables
        });
        return res;
    }

    parseSearchJson(jsonLine, isLatestQuery = false) {
        const jsonData = JSON.parse(jsonLine);
        const metaData = jsonData;

        const mediaList = isLatestQuery
            ? metaData.data?.Page?.airingSchedules?.map(schedule => schedule.media) || []
            : metaData.data?.Page?.media || [];

        const hasNextPage = metaData.data?.Page?.pageInfo?.hasNextPage || false;

        const preferenceTitle = new SharedPreferences().get("pref_title_1");

        const animeList = mediaList
            .filter(media => !((media?.countryOfOrigin === "CN" || media?.isAdult) && isLatestQuery))
            .map(media => {
                const anime = {};
                anime.link = media?.id?.toString() || "";
                anime.name = (() => {
                    switch (preferenceTitle) {
                        case "english":
                            return media?.title?.english?.trim() || media?.title?.romaji || "";
                        case "native":
                            return media?.title?.native || media?.title?.romaji || "";
                        case "romaji":
                        default:
                            return media?.title?.romaji || "";
                    }
                })();
                anime.imageUrl = media?.coverImage?.extraLarge || media?.coverImage?.large || "";

                return anime;
            });

        return { "list": animeList, "hasNextPage": hasNextPage };
    }

    async getPopular(page) {
        const variables = {
            page: page,
            perPage: 30,
            sort: ["TRENDING_DESC"],
            status: ["FINISHED", "RELEASING"]
        };

        const res = await this.makeGraphQLRequest(this.anilistQuery(), variables);
        return this.parseSearchJson(res.body);
    }

    async getLatestUpdates(page) {
        const variables = {
            page: page,
            perPage: 30,
            sort: ["TIME_DESC"]
        };

        const res = await this.makeGraphQLRequest(this.anilistLatestQuery(), variables);
        return this.parseSearchJson(res.body, true);
    }

    async search(query, page, filters) {
        query = (query || "").trim();

        if (query.startsWith("https://")) {
            const parts = query.split("/").filter(Boolean);
            const id = parts.pop();
            if (id && !isNaN(id)) query = `id:${id}`;
        }

        if (query.startsWith("id:")) {
            const id = query.replace("id:", "").trim();
            const detail = await this.getDetail(id);
            return {
                list: [{
                    link: id,
                    name: detail.name || id,
                    imageUrl: detail.imageUrl || ""
                }],
                hasNextPage: false
            };
        }

        const variables = {
            page: page,
            perPage: 30,
            sort: ["POPULARITY_DESC"]
        };

        if (query.length > 0) {
            variables.search = query;
        }

        if (filters && filters.length > 0) {
            for (const filter of filters) {
                if (filter.type_name === "SelectFilter") {
                    const selected = filter.values[filter.state];
                    const val = Array.isArray(selected) ? selected[1] : (selected?.value ?? selected);

                    if (filter.name === "Sort" && val) {
                        variables.sort = [val];
                    } else if (filter.name === "Year" && val) {
                        variables.year = `${val}%`;
                    } else if (filter.name === "Season" && val) {
                        variables.season = val;
                    } else if (filter.name === "Airing Status" && val) {
                        variables.status = [val];
                    }
                } else if (filter.type_name === "GroupFilter") {
                    const activeValues = (filter.state || [])
                        .filter(item => item.state === true)
                        .map(item => item.value);

                    if (filter.name === "Format" && activeValues.length > 0) {
                        variables.format = activeValues;
                    } else if (filter.name === "Genres" && activeValues.length > 0) {
                        variables.genres = activeValues;
                    }
                }
            }
        }

        const res = await this.makeGraphQLRequest(this.anilistQuery(), variables);
        return this.parseSearchJson(res.body);
    }

    async getDetail(url) {
        const query = `
            query ($id: Int) {
                Media(id: $id, isAdult: false) {
                    id
                    title {
                        romaji
                        english
                        native
                    }
                    coverImage {
                        extraLarge
                        large
                    }
                    description
                    status
                    season
                    seasonYear
                    format
                    episodes
                    tags {
                        name
                    }
                    genres
                    studios {
                        nodes {
                            name
                        }
                    }
                    countryOfOrigin
                    isAdult
                }
            }
        `.trim();

        const variables = { id: parseInt(url) || url };
        const res = await this.makeGraphQLRequest(query, variables);
        const media = JSON.parse(res.body).data?.Media;
        const anime = {};

        const preferences = new SharedPreferences();
        const preferenceTitle = preferences.get("pref_title_1");
        anime.name = (() => {
            switch (preferenceTitle) {
                case "english":
                    return media?.title?.english?.trim() || media?.title?.romaji || "";
                case "native":
                    return media?.title?.native || media?.title?.romaji || "";
                case "romaji":
                default:
                    return media?.title?.romaji || "";
            }
        })();

        anime.imageUrl = media?.coverImage?.extraLarge || media?.coverImage?.large || "";

        let desc = (media?.description || "No Description")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<.*?>/g, "")
            .trim();

        if (media?.season || media?.seasonYear) {
            desc += `\n\nRelease: ${media.season || ""} ${media.seasonYear || ""}`.trim();
        }
        if (media?.format) {
            desc += `\nType: ${media.format}`;
        }
        if (media?.episodes) {
            desc += `\nTotal Episode Count: ${media.episodes}`;
        }
        anime.description = desc;

        anime.status = (() => {
            switch (media?.status) {
                case "RELEASING":
                    return 0;
                case "FINISHED":
                    return 1;
                case "HIATUS":
                    return 2;
                case "NOT_YET_RELEASED":
                    return 3;
                default:
                    return 5;
            }
        })();

        const tagsList = media?.tags?.map(tag => tag.name).filter(Boolean) || [];
        const genresList = media?.genres || [];
        anime.genre = [...new Set([...tagsList, ...genresList])].sort();
        const studiosList = media?.studios?.nodes?.map(node => node.name).filter(Boolean) || [];
        anime.author = studiosList.sort().join(", ");

        // 1. Fetch AniZip mapping
        let kitsuId = null;
        let aniZipData = null;
        try {
            const aniZipRes = await this.client.get(`https://api.ani.zip/mappings?anilist_id=${url}`);
            aniZipData = JSON.parse(aniZipRes.body);
            kitsuId = aniZipData.mappings?.kitsu_id?.toString() || null;
        } catch (_) { }

        // Fallback to Kitsu API if kitsuId missing
        if (!kitsuId) {
            try {
                const kitsuRes = await this.client.get(`https://kitsu.io/api/edge/mappings?filter[externalSite]=anilist/anime&filter[externalId]=${url}&include=item`);
                const kitsuJson = JSON.parse(kitsuRes.body);
                kitsuId = kitsuJson.data?.[0]?.relationships?.item?.data?.id?.toString() || null;
            } catch (_) { }
        }

        if (!kitsuId) {
            anime.episodes = [];
            return anime;
        }

        const showUpcoming = preferences.get("pref_upcoming_ep_1") ?? false;
        const now = Date.now();

        // 2. Parse Episodes directly from AniZip
        if (aniZipData && aniZipData.episodes && Object.keys(aniZipData.episodes).length > 0) {
            const mediaType = aniZipData.mappings?.type || "TV";

            if (mediaType === "MOVIE") {
                const ep1 = aniZipData.episodes["1"];
                const releaseDate = ep1?.airdate ? new Date(ep1.airdate).getTime() : 0;
                anime.episodes = [{
                    url: `/stream/movie/kitsu:${kitsuId}.json`,
                    name: "Movie",
                    dateUpload: releaseDate ? releaseDate.toString() : ""
                }];
            } else {
                const epList = [];
                for (const key of Object.keys(aniZipData.episodes)) {
                    const ep = aniZipData.episodes[key];
                    if (!ep) continue;
                    const epNum = ep.episodeNumber || ep.episode || key;
                    const airTime = ep.airdate ? new Date(ep.airdate).getTime() : 0;

                    if (!showUpcoming && airTime > now) {
                        continue;
                    }

                    const title = ep.title?.en || ep.title?.["x-jat"] || ep.title?.ja || "";
                    const epName = title ? `Episode ${epNum}: ${title}` : `Episode ${epNum}`;

                    epList.push({
                        url: `/stream/series/kitsu:${kitsuId}:${epNum}.json`,
                        name: epName,
                        dateUpload: airTime ? airTime.toString() : "",
                        scanlator: (airTime > now) ? "Upcoming" : ""
                    });
                }
                anime.episodes = epList.reverse();
            }
        } else {
            // Fallback: anime-kitsu stremio addon
            try {
                const responseEpisodes = await this.client.get(`https://anime-kitsu.strem.fun/meta/series/kitsu%3A${kitsuId}.json`);
                const episodeList = JSON.parse(responseEpisodes.body);
                if (episodeList.meta?.type === "series" && episodeList.meta.videos) {
                    anime.episodes = episodeList.meta.videos
                        .filter(video => showUpcoming || !video.released || new Date(video.released).getTime() <= now)
                        .map(video => {
                            const releaseDate = video.released ? new Date(video.released).getTime() : now;
                            return {
                                url: `/stream/series/kitsu:${kitsuId}:${video.episode}.json`,
                                dateUpload: releaseDate.toString(),
                                name: `Episode ${video.episode}${video.title ? " : " + video.title.replace(/^Episode \d+\s*:?\s*/i, "").trim() : ""}`,
                            };
                        })
                        .reverse();
                } else if (episodeList.meta?.type === "movie") {
                    anime.episodes = [{
                        url: `/stream/movie/kitsu:${kitsuId}.json`,
                        name: "Movie",
                    }];
                } else {
                    anime.episodes = [];
                }
            } catch (_) {
                anime.episodes = [];
            }
        }

        return anime;
    }

    appendQueryParam(key, values) {
        let url = "";
        if (values && values.length > 0) {
            const filteredValues = Array.from(values).filter(value => value.trim() !== "").join(",");
            url += `${key}=${filteredValues}|`;
        }
        return url;
    }

    async getVideoList(url) {
        const preferences = new SharedPreferences();

        let mainURL = `${this.source.baseUrl}/`;
        mainURL += this.appendQueryParam("providers", preferences.get("provider_selection_1"));
        mainURL += this.appendQueryParam("language", preferences.get("lang_selection"));
        mainURL += this.appendQueryParam("qualityfilter", preferences.get("quality_selection"));
        mainURL += this.appendQueryParam("sort", new Set([preferences.get("sorting_link_1")]));

        const debridProvider = preferences.get("debrid_provider_1") || "none";
        const token = (preferences.get("token_1") || "").trim();

        if (debridProvider !== "none") {
            if (!token) {
                throw new Error("Kindly input the debrid token in the extension settings.");
            }
            mainURL += `${debridProvider}=${token}|`;
        }

        mainURL += url;
        mainURL = mainURL.replace(/\|$/, "");

        const responseEpisodes = await this.client.get(mainURL);
        const streamList = JSON.parse(responseEpisodes.body);

        const animeTrackers = [
            "http://nyaa.tracker.wf:7777/announce",
            "http://anidex.moe:6969/announce",
            "http://tracker.anirena.com:80/announce",
            "udp://tracker.uw0.xyz:6969/announce",
            "http://share.camoe.cn:8080/announce",
            "http://t.nyaatracker.com:80/announce",
            "udp://47.ip-51-68-199.eu:6969/announce",
            "udp://9.rarbg.me:2940",
            "udp://9.rarbg.to:2820",
            "udp://exodus.desync.com:6969/announce",
            "udp://explodie.org:6969/announce",
            "udp://ipv4.tracker.harry.lu:80/announce",
            "udp://open.stealth.si:80/announce",
            "udp://opentor.org:2710/announce",
            "udp://opentracker.i2p.rocks:6969/announce",
            "udp://retracker.lanta-net.ru:2710/announce",
            "udp://tracker.cyberia.is:6969/announce",
            "udp://tracker.dler.org:6969/announce",
            "udp://tracker.ds.is:6969/announce",
            "udp://tracker.internetwarriors.net:1337",
            "udp://tracker.openbittorrent.com:6969/announce",
            "udp://tracker.opentrackr.org:1337/announce",
            "udp://tracker.tiny-vps.com:6969/announce",
            "udp://tracker.torrent.eu.org:451/announce",
            "udp://valakas.rollo.dnsabr.com:2710/announce",
            "udp://www.torrent.eu.org:451/announce"
        ];

        const videos = this.sortVideos((streamList.streams || []).map(stream => {
            const isDebrid = debridProvider !== "none" && stream.url;
            const videoUrl = isDebrid
                ? stream.url
                : `magnet:?xt=urn:btih:${stream.infoHash}&dn=${stream.infoHash}&tr=${animeTrackers.join("&tr=")}${stream.fileIdx !== undefined && stream.fileIdx !== null ? "&index=" + stream.fileIdx : ""}`;

            const videoTitle = `${(stream.name || "").replace("Torrentio\n", "")}\n${stream.title || ""}`.trim();

            return {
                url: videoUrl,
                originalUrl: videoUrl,
                quality: videoTitle,
            };
        }));

        const numberOfLinks = preferences.get("number_of_links_1");
        if (!numberOfLinks || numberOfLinks === "all") {
            return videos;
        }

        return videos.slice(0, parseInt(numberOfLinks));
    }

    sortVideos(videos) {
        const preferences = new SharedPreferences();

        const isDub = preferences.get("dubbed");
        const isEfficient = preferences.get("efficient_1");

        return videos.sort((a, b) => {
            const regexMatchA = /\[(.+?) download\]/.test(a.quality);
            const regexMatchB = /\[(.+?) download\]/.test(b.quality);

            const isDubA = isDub && !a.quality.toLowerCase().includes("dubbed");
            const isDubB = isDub && !b.quality.toLowerCase().includes("dubbed");

            const isEfficientA = isEfficient && !["hevc", "265", "av1"].some(q => a.quality.toLowerCase().includes(q));
            const isEfficientB = isEfficient && !["hevc", "265", "av1"].some(q => b.quality.toLowerCase().includes(q));

            return (
                regexMatchA - regexMatchB ||
                isDubA - isDubB ||
                isEfficientA - isEfficientB
            );
        });
    }

    getFilterList() {
        return [
            {
                type_name: "SelectFilter",
                name: "Sort",
                state: 0,
                values: [
                    ["Popularity", "POPULARITY_DESC"],
                    ["Trending", "TRENDING_DESC"],
                    ["Average Score", "SCORE_DESC"],
                    ["Release Date", "START_DATE_DESC"],
                    ["Title", "TITLE_ENGLISH_DESC"],
                    ["Favorites", "FAVOURITES_DESC"],
                    ["Date Added", "ID_DESC"]
                ]
            },
            {
                type_name: "GroupFilter",
                name: "Format",
                state: [
                    ["TV Show", "TV"],
                    ["Movie", "MOVIE"],
                    ["TV Short", "TV_SHORT"],
                    ["Special", "SPECIAL"],
                    ["OVA", "OVA"],
                    ["ONA", "ONA"],
                    ["Music", "MUSIC"]
                ].map(x => ({ type_name: "CheckBox", name: x[0], value: x[1], state: false }))
            },
            {
                type_name: "GroupFilter",
                name: "Genres",
                state: [
                    "Action", "Adventure", "Comedy", "Drama", "Ecchi",
                    "Fantasy", "Horror", "Mahou Shoujo", "Mecha", "Music",
                    "Mystery", "Psychological", "Romance", "Sci-Fi",
                    "Slice of Life", "Sports", "Supernatural", "Thriller"
                ].map(g => ({ type_name: "CheckBox", name: g, value: g, state: false }))
            },
            {
                type_name: "SelectFilter",
                name: "Year",
                state: 0,
                values: [
                    ["Any", ""],
                    ...Array.from({ length: 87 }, (_, i) => [String(2026 - i), String(2026 - i)])
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Season",
                state: 0,
                values: [
                    ["Any", ""],
                    ["Winter", "WINTER"],
                    ["Spring", "SPRING"],
                    ["Summer", "SUMMER"],
                    ["Fall", "FALL"]
                ]
            },
            {
                type_name: "SelectFilter",
                name: "Airing Status",
                state: 0,
                values: [
                    ["Any", ""],
                    ["Airing", "RELEASING"],
                    ["Finished", "FINISHED"],
                    ["Not Yet Aired", "NOT_YET_RELEASED"],
                    ["Cancelled", "CANCELLED"]
                ]
            }
        ];
    }

    getSourcePreferences() {
        return [
            {
                "key": "debrid_provider_1",
                "listPreference": {
                    "title": "Debrid Provider",
                    "summary": "Choose \x27None\x27 for Torrent. If you select a Debrid provider, enter your token key below.",
                    "valueIndex": 0,
                    "entries": [
                        "None",
                        "RealDebrid",
                        "Premiumize",
                        "AllDebrid",
                        "DebridLink",
                        "EasyDebrid",
                        "Offcloud",
                        "TorBox"
                    ],
                    "entryValues": [
                        "none",
                        "realdebrid",
                        "premiumize",
                        "alldebrid",
                        "debridlink",
                        "easydebrid",
                        "offcloud",
                        "torbox"
                    ]
                }
            },
            {
                "key": "token_1",
                "editTextPreference": {
                    "title": "Debrid API Token / Key",
                    "summary": "Exclusive to Debrid providers; not intended for Torrents.",
                    "value": "",
                    "dialogTitle": "Debrid API Token / Key",
                    "dialogMessage": "Enter your Debrid service API key/token"
                }
            },
            {
                "key": "number_of_links_1",
                "listPreference": {
                    "title": "Number of links to load for video list",
                    "summary": "⚠️ Increasing the number of links will increase the loading time of the video list",
                    "valueIndex": 1,
                    "entries": [
                        "2",
                        "4",
                        "8",
                        "12",
                        "all"
                    ],
                    "entryValues": [
                        "2",
                        "4",
                        "8",
                        "12",
                        "all"
                    ]
                }
            },
            {
                "key": "provider_selection_1",
                "multiSelectListPreference": {
                    "title": "Enable/Disable Providers",
                    "summary": "",
                    "entries": [
                        "YTS",
                        "EZTV",
                        "RARBG",
                        "1337x",
                        "ThePirateBay",
                        "KickassTorrents",
                        "TorrentGalaxy",
                        "MagnetDL",
                        "HorribleSubs",
                        "NyaaSi",
                        "TokyoTosho",
                        "AniDex",
                        "nekoBT",
                        "🇷🇺 Rutor",
                        "🇷🇺 Rutracker",
                        "🇵🇹 Comando",
                        "🇵🇹 BluDV",
                        "🇫🇷 Torrent9",
                        "🇮🇹 ilCorSaRoNero",
                        "🇪🇸 MejorTorrent",
                        "🇪🇸 Wolfmax4k",
                        "🇲🇽 Cinecalidad",
                        "🇵🇱 BestTorrents"
                    ],
                    "entryValues": [
                        "yts",
                        "eztv",
                        "rarbg",
                        "1337x",
                        "thepiratebay",
                        "kickasstorrents",
                        "torrentgalaxy",
                        "magnetdl",
                        "horriblesubs",
                        "nyaasi",
                        "tokyotosho",
                        "anidex",
                        "nekobt",
                        "rutor",
                        "rutracker",
                        "comando",
                        "bludv",
                        "torrent9",
                        "ilcorsaronero",
                        "mejortorrent",
                        "wolfmax4k",
                        "cinecalidad",
                        "besttorrents"
                    ],
                    "values": [
                        "nyaasi",
                        "tokyotosho",
                        "anidex"
                    ]
                }
            },
            {
                "key": "quality_selection",
                "multiSelectListPreference": {
                    "title": "Exclude Qualities/Resolutions",
                    "summary": "",
                    "entries": [
                        "BluRay REMUX",
                        "HDR/HDR10+/Dolby Vision",
                        "Dolby Vision",
                        "4k",
                        "1080p",
                        "720p",
                        "480p",
                        "Other (DVDRip/HDRip/BDRip...)",
                        "Screener",
                        "Cam",
                        "Unknown"
                    ],
                    "entryValues": [
                        "brremux",
                        "hdrall",
                        "dolbyvision",
                        "4k",
                        "1080p",
                        "720p",
                        "480p",
                        "other",
                        "scr",
                        "cam",
                        "unknown"
                    ],
                    "values": [
                        "720p",
                        "480p",
                        "other",
                        "scr",
                        "cam",
                        "unknown"
                    ]
                }
            },
            {
                "key": "lang_selection",
                "multiSelectListPreference": {
                    "title": "Priority foreign language",
                    "summary": "",
                    "entries": [
                        "🇯🇵 Japanese",
                        "🇷🇺 Russian",
                        "🇮🇹 Italian",
                        "🇵🇹 Portuguese",
                        "🇪🇸 Spanish",
                        "🇲🇽 Latino",
                        "🇰🇷 Korean",
                        "🇨🇳 Chinese",
                        "🇹🇼 Taiwanese",
                        "🇫🇷 French",
                        "🇩🇪 German",
                        "🇳🇱 Dutch",
                        "🇮🇳 Hindi",
                        "🇮🇳 Telugu",
                        "🇮🇳 Tamil",
                        "🇵🇱 Polish",
                        "🇱🇹 Lithuanian",
                        "🇱🇻 Latvian",
                        "🇪🇪 Estonian",
                        "🇨🇿 Czech",
                        "🇸🇰 Slovakian",
                        "🇸🇮 Slovenian",
                        "🇭🇺 Hungarian",
                        "🇷🇴 Romanian",
                        "🇧🇬 Bulgarian",
                        "🇷🇸 Serbian",
                        "🇭🇷 Croatian",
                        "🇺🇦 Ukrainian",
                        "🇬🇷 Greek",
                        "🇩🇰 Danish",
                        "🇫🇮 Finnish",
                        "🇸🇪 Swedish",
                        "🇳🇴 Norwegian",
                        "🇹🇷 Turkish",
                        "🇸🇦 Arabic",
                        "🇮🇷 Persian",
                        "🇮🇱 Hebrew",
                        "🇻🇳 Vietnamese",
                        "🇮🇩 Indonesian",
                        "🇲🇾 Malay",
                        "🇹🇭 Thai"
                    ],
                    "entryValues": [
                        "japanese",
                        "russian",
                        "italian",
                        "portuguese",
                        "spanish",
                        "latino",
                        "korean",
                        "chinese",
                        "taiwanese",
                        "french",
                        "german",
                        "dutch",
                        "hindi",
                        "telugu",
                        "tamil",
                        "polish",
                        "lithuanian",
                        "latvian",
                        "estonian",
                        "czech",
                        "slovakian",
                        "slovenian",
                        "hungarian",
                        "romanian",
                        "bulgarian",
                        "serbian",
                        "croatian",
                        "ukrainian",
                        "greek",
                        "danish",
                        "finnish",
                        "swedish",
                        "norwegian",
                        "turkish",
                        "arabic",
                        "persian",
                        "hebrew",
                        "vietnamese",
                        "indonesian",
                        "malay",
                        "thai"
                    ],
                    "values": []
                }
            },
            {
                "key": "sorting_link_1",
                "listPreference": {
                    "title": "Sorting",
                    "summary": "",
                    "valueIndex": 0,
                    "entries": [
                        "By quality then seeders",
                        "By quality then size",
                        "By seeders",
                        "By size"
                    ],
                    "entryValues": [
                        "quality",
                        "qualitysize",
                        "seeders",
                        "size"
                    ]
                }
            },
            {
                "key": "pref_title_1",
                "listPreference": {
                    "title": "Preferred Title",
                    "summary": "",
                    "valueIndex": 0,
                    "entries": [
                        "Romaji",
                        "English",
                        "Native"
                    ],
                    "entryValues": [
                        "romaji",
                        "english",
                        "native"
                    ]
                }
            },
            {
                "key": "pref_upcoming_ep_1",
                "switchPreferenceCompat": {
                    "title": "Show Upcoming Episodes",
                    "summary": "Show unreleased / upcoming episodes in the episode list",
                    "value": false
                }
            },
            {
                "key": "dubbed",
                "switchPreferenceCompat": {
                    "title": "Dubbed Video Priority",
                    "summary": "",
                    "value": false
                }
            },
            {
                "key": "efficient_1",
                "switchPreferenceCompat": {
                    "title": "Efficient Video Priority",
                    "summary": "Codec: (HEVC / x265) & AV1. High-quality video with less data usage.",
                    "value": false
                }
            }
        ];
    }
}
