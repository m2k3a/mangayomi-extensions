const mangayomiSources = [{
    "name": "Debrid Index",
    "lang": "all",
    "baseUrl": "https://torrentio.strem.fun",
    "apiUrl": "",
    "iconUrl": "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/main/javascript/icon/all.debridindex.png",
    "typeSource": "single",
    "isManga": false,
    "itemType": 1,
    "version": "0.0.1",
    "pkgPath": "anime/src/all/debridindex.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    async getPopular(page) {
        if (page > 1) return { list: [], hasNextPage: false };

        const preferences = new SharedPreferences();
        const token = (preferences.get("token") || "").trim();
        const debridProvider = (preferences.get("debrid_provider") || "realdebrid").toLowerCase();

        if (!token) {
            return {
                list: [{
                    name: "Please enter your Debrid token in Extension Settings",
                    link: "error",
                    imageUrl: "https://i.ibb.co/Q9GPtbC/default.png"
                }],
                hasNextPage: false
            };
        }

        const url = `${this.source.baseUrl}/${debridProvider}=${token}/catalog/other/torrentio-${debridProvider}.json`;
        const res = await this.client.get(url);
        const data = JSON.parse(res.body);
        const metas = data.metas || [];

        const list = metas.map(meta => ({
            name: meta.name || "Untitled",
            link: meta.id || "",
            imageUrl: meta.name === "Downloads" ? "https://i.ibb.co/MGmhmJg/download.png" : "https://i.ibb.co/Q9GPtbC/default.png"
        }));

        return { list, hasNextPage: false };
    }

    async getLatestUpdates(page) {
        return { list: [], hasNextPage: false };
    }

    async search(query, page, filters) {
        query = (query || "").trim();
        if (!query) return await this.getPopular(page);

        const preferences = new SharedPreferences();
        const token = (preferences.get("token") || "").trim();
        const debridProvider = preferences.get("debrid_provider") || "RealDebrid";

        if (!token) return await this.getPopular(page);

        const config = JSON.stringify({
            "DebridProvider": debridProvider,
            "DebridApiKey": token
        });

        const url = `https://68d69db7dc40-debrid-search.baby-beamup.club/${encodeURIComponent(config)}/catalog/other/debridsearch/search=${encodeURIComponent(query)}.json`;
        const res = await this.client.get(url);
        const data = JSON.parse(res.body);
        const metas = data.metas || [];

        const list = metas.map(meta => ({
            name: meta.name || query,
            link: meta.id || "",
            imageUrl: "https://i.ibb.co/Q9GPtbC/default.png"
        }));

        return { list, hasNextPage: false };
    }

    async getDetail(url) {
        if (url === "error") {
            return {
                name: "Debrid Index",
                description: "Kindly configure your Debrid Provider and API token in Extension Settings.",
                episodes: []
            };
        }

        const preferences = new SharedPreferences();
        const token = (preferences.get("token") || "").trim();
        const debridProvider = (preferences.get("debrid_provider") || "realdebrid").toLowerCase();
        const isFileNameOnly = preferences.get("is_filename") ?? false;

        const reqUrl = `${this.source.baseUrl}/${debridProvider}=${token}/meta/other/${url}.json`;
        const res = await this.client.get(reqUrl);
        const data = JSON.parse(res.body);
        const meta = data.meta || {};
        const videos = meta.videos || [];

        const episodes = videos.map((video, index) => {
            let epName = (video.title || `File ${index + 1}`).trim();
            if (isFileNameOnly) {
                epName = epName.split("/").pop() || epName;
            } else {
                epName = epName.replace(/[\[\]]/g, "").replace(/\//g, " 📁 ");
            }

            const streamUrl = video.streams?.[0]?.url || "";
            const releaseDate = video.released ? new Date(video.released).getTime() : 0;

            return {
                name: epName,
                url: streamUrl,
                dateUpload: releaseDate ? releaseDate.toString() : ""
            };
        }).reverse();

        return {
            name: meta.name || "Files",
            imageUrl: "https://i.ibb.co/Q9GPtbC/default.png",
            description: meta.name || "Debrid Cached Files",
            episodes: episodes
        };
    }

    async getVideoList(url) {
        if (!url || !url.startsWith("http")) return [];
        return [{
            url: url,
            originalUrl: url,
            quality: "Direct Stream"
        }];
    }

    getSourcePreferences() {
        return [
            {
                "key": "debrid_provider",
                "listPreference": {
                    "title": "Debrid Provider",
                    "summary": "Choose your Debrid service",
                    "valueIndex": 0,
                    "entries": [
                        "RealDebrid",
                        "Premiumize",
                        "AllDebrid",
                        "DebridLink",
                        "Offcloud",
                        "TorBox"
                    ],
                    "entryValues": [
                        "realdebrid",
                        "premiumize",
                        "alldebrid",
                        "debridlink",
                        "offcloud",
                        "torbox"
                    ]
                }
            },
            {
                "key": "token",
                "editTextPreference": {
                    "title": "Debrid API Token / Key",
                    "summary": "Enter your Debrid service API key/token",
                    "value": "",
                    "dialogTitle": "Debrid API Token / Key",
                    "dialogMessage": "Enter your Debrid service API key/token"
                }
            },
            {
                "key": "is_filename",
                "switchPreferenceCompat": {
                    "title": "Show File Name Only",
                    "summary": "Display only the file name instead of the entire folder path",
                    "value": false
                }
            }
        ];
    }
}
