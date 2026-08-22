const mangayomiSources = [{
    "name": "SubsPlease",
    "lang": "all",
    "baseUrl": "https://subsplease.org",
    "apiUrl": "",
    "iconUrl": "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/main/javascript/icon/all.subsplease.png",
    "typeSource": "torrent",
    "isManga": false,
    "itemType": 1,
    "version": "0.0.1",
    "pkgPath": "anime/src/all/subsplease.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    getHeaders() {
        return {
            "Referer": this.source.baseUrl,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        };
    }

    async getPopular(page) {
        if (page > 1) return { list: [], hasNextPage: false };
        const res = await this.client.get(`${this.source.baseUrl}/api/?f=schedule&tz=Europe/Berlin`, this.getHeaders());
        const data = JSON.parse(res.body);
        const schedule = data.schedule || {};
        const seen = new Set();
        const list = [];

        for (const day of Object.keys(schedule)) {
            const items = schedule[day] || [];
            for (const item of items) {
                const title = item.title;
                const pageUrl = item.page;
                if (!title || !pageUrl || seen.has(pageUrl)) continue;
                seen.add(pageUrl);
                const imageUrl = item.image_url ? (item.image_url.startsWith("http") ? item.image_url : `${this.source.baseUrl}${item.image_url}`) : "";
                list.push({
                    name: title,
                    imageUrl: imageUrl,
                    link: `/shows/${pageUrl}`
                });
            }
        }

        return { list, hasNextPage: false };
    }

    async getLatestUpdates(page) {
        const url = page === 1
            ? `${this.source.baseUrl}/api/?f=latest&tz=Europe/Berlin`
            : `${this.source.baseUrl}/api/?f=latest&tz=Europe/Berlin&p=${page - 1}`;

        const res = await this.client.get(url, {
            ...this.getHeaders(),
            "X-Requested-With": "XMLHttpRequest"
        });

        const data = JSON.parse(res.body);
        const seen = new Set();
        const list = [];

        for (const key of Object.keys(data)) {
            const item = data[key];
            if (!item || typeof item !== "object") continue;
            const title = item.show;
            const pageUrl = item.page;
            if (!title || !pageUrl || seen.has(pageUrl)) continue;
            seen.add(pageUrl);
            const imageUrl = item.image_url ? (item.image_url.startsWith("http") ? item.image_url : `${this.source.baseUrl}${item.image_url}`) : "";
            list.push({
                name: title,
                imageUrl: imageUrl,
                link: `/shows/${pageUrl}`
            });
        }

        return { list, hasNextPage: page < 2 };
    }

    async search(query, page, filters) {
        query = (query || "").trim();
        if (!query) return await this.getPopular(page);

        const res = await this.client.get(`${this.source.baseUrl}/api/?f=search&tz=Europe/Berlin&s=${encodeURIComponent(query)}`, this.getHeaders());
        const data = JSON.parse(res.body);
        const seen = new Set();
        const list = [];

        for (const key of Object.keys(data)) {
            const item = data[key];
            if (!item || typeof item !== "object") continue;
            const title = item.show;
            const pageUrl = item.page;
            if (!title || !pageUrl || seen.has(pageUrl)) continue;
            seen.add(pageUrl);
            const imageUrl = item.image_url ? (item.image_url.startsWith("http") ? item.image_url : `${this.source.baseUrl}${item.image_url}`) : "";
            list.push({
                name: title,
                imageUrl: imageUrl,
                link: `/shows/${pageUrl}`
            });
        }

        return { list, hasNextPage: false };
    }

    async getDetail(url) {
        const fullUrl = url.startsWith("http") ? url : `${this.source.baseUrl}${url}`;
        const res = await this.client.get(fullUrl, this.getHeaders());
        const doc = new Document(res.body);

        const anime = {};
        anime.name = doc.selectFirst("h1.heading")?.text?.trim() || "";
        const desc = doc.selectFirst("div.series-syn p")?.text?.trim() || "";
        anime.description = desc;

        let sid = doc.selectFirst("#show-release-table")?.attr("sid") || "";
        if (!sid) {
            const sidMatch = res.body.match(/sid="(\d+)"/i);
            if (sidMatch) sid = sidMatch[1];
        }

        if (!sid) {
            anime.episodes = [];
            return anime;
        }

        const apiRes = await this.client.get(`${this.source.baseUrl}/api/?f=show&tz=Europe/Berlin&sid=${sid}`, this.getHeaders());
        const data = JSON.parse(apiRes.body);
        const episodesObj = data.episode || {};
        const episodes = [];

        for (const key of Object.keys(episodesObj)) {
            const epData = episodesObj[key];
            if (!epData) continue;
            const epNum = epData.episode || key;
            const releaseDate = epData.release_date ? new Date(epData.release_date).getTime() : 0;

            episodes.push({
                name: `Episode ${epNum}`,
                url: `/api/?f=show&tz=Europe/Berlin&sid=${sid}&num=${epNum}`,
                dateUpload: releaseDate ? releaseDate.toString() : ""
            });
        }

        anime.episodes = episodes;
        return anime;
    }

    debridResolve(magnet, title) {
        const infoHashMatch = magnet.match(/xt=urn:btih:([A-Fa-f0-9]{40}|[A-Za-z0-9]{32})/i);
        const dnMatch = magnet.match(/dn=([^&]+)/i);
        const infoHash = infoHashMatch ? infoHashMatch[1] : "";
        const dn = dnMatch ? dnMatch[1] : encodeURIComponent(title || "");

        const preferences = new SharedPreferences();
        const debridProvider = preferences.get("debrid_provider") || "none";
        const token = (preferences.get("token") || "").trim();

        if (debridProvider !== "none" && token && infoHash) {
            return `https://torrentio.strem.fun/resolve/${debridProvider}/${token}/${infoHash}/null/0/${dn}`;
        }
        return magnet;
    }

    async getVideoList(url) {
        const fullUrl = url.startsWith("http") ? url : `${this.source.baseUrl}${url}`;
        const numMatch = url.match(/num=([^&]+)/i);
        const targetNum = numMatch ? numMatch[1] : "";

        const sidMatch = url.match(/sid=([^&]+)/i);
        const sid = sidMatch ? sidMatch[1] : "";

        const res = await this.client.get(`${this.source.baseUrl}/api/?f=show&tz=Europe/Berlin&sid=${sid}`, this.getHeaders());
        const data = JSON.parse(res.body);
        const episodesObj = data.episode || {};
        const videos = [];

        const preferences = new SharedPreferences();
        const debridProvider = preferences.get("debrid_provider") || "none";

        for (const key of Object.keys(episodesObj)) {
            const epData = episodesObj[key];
            if (!epData) continue;
            const epNum = epData.episode || key;
            if (targetNum && epNum !== targetNum) continue;

            const downloads = epData.downloads || [];
            for (const dl of downloads) {
                const resStr = dl.res ? `${dl.res}p` : "1080p";
                const magnet = dl.magnet || "";
                if (!magnet) continue;

                const videoUrl = (debridProvider !== "none")
                    ? this.debridResolve(magnet, `Episode ${epNum}`)
                    : magnet;

                videos.push({
                    url: videoUrl,
                    originalUrl: videoUrl,
                    quality: `SubsPlease - ${resStr}`
                });
            }
        }

        const preferredQuality = preferences.get("preferred_quality") || "1080";
        return videos.sort((a, b) => {
            const aMatch = a.quality.includes(preferredQuality) ? 1 : 0;
            const bMatch = b.quality.includes(preferredQuality) ? 1 : 0;
            return bMatch - aMatch;
        });
    }

    getSourcePreferences() {
        return [
            {
                "key": "debrid_provider",
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
                        "Offcloud",
                        "TorBox"
                    ],
                    "entryValues": [
                        "none",
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
                    "summary": "Exclusive to Debrid providers; not intended for Torrents.",
                    "value": "",
                    "dialogTitle": "Debrid API Token / Key",
                    "dialogMessage": "Enter your Debrid service API key/token"
                }
            },
            {
                "key": "preferred_quality",
                "listPreference": {
                    "title": "Default Quality",
                    "summary": "",
                    "valueIndex": 0,
                    "entries": ["1080p", "720p", "480p"],
                    "entryValues": ["1080", "720", "480"]
                }
            }
        ];
    }
}
