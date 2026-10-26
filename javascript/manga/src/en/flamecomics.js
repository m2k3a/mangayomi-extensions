const mangayomiSources = [{
    "id": 100203065,
    "name": "Flame Comics",
    "lang": "en",
    "baseUrl": "https://flamecomics.xyz",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=https://flamecomics.xyz",
    "typeSource": "single",
    "itemType": 0,
    "isNsfw": false,
    "version": "0.1.0",
    "pkgPath": "manga/src/en/flamecomics.js"
}];

const CDN = "https://cdn.flamecomics.xyz/uploads/images/series";

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    getHeaders(url) {
        return { "Referer": `${this.source.baseUrl}/` };
    }

    // The site is Next.js: its data lives under /_next/data/<build id>/, and
    // the build id changes with every deploy. The last one seen is kept.
    async buildId(fresh) {
        const prefs = new SharedPreferences();
        let id = fresh ? "" : prefs.getString("build_id", "");
        if (!id) {
            const res = await this.client.get(this.source.baseUrl, this.getHeaders());
            const m = res.body.match(/"buildId"\s*:\s*"([^"]+)"/);
            if (!m) throw new Error("Could not read the site's build id");
            id = m[1];
            prefs.setString("build_id", id);
        }
        return id;
    }

    async data(path) {
        // An outdated build id gets a 404; read the current one and try again
        for (const fresh of [false, true]) {
            try {
                const id = await this.buildId(fresh);
                const res = await this.client.get(`${this.source.baseUrl}/_next/data/${id}${path}`, this.getHeaders());
                if (res.statusCode != 200) throw new Error(`HTTP ${res.statusCode}`);
                return JSON.parse(res.body).pageProps;
            } catch (e) {
                if (fresh) throw e;
            }
        }
    }

    // Older entries hold lists as their Python repr: "['Action', 'Fantasy']"
    names(value) {
        if (Array.isArray(value)) return value;
        if (!value) return [];
        return String(value).replace(/^\[|\]$/g, "").split(/,\s*/)
            .map(s => s.trim().replace(/^['"]|['"]$/g, "")).filter(s => s);
    }

    toManga(series) {
        return {
            name: series.title,
            imageUrl: `${CDN}/${series.series_id}/${series.cover}?${series.last_edit}`,
            link: `/series/${series.series_id}`,
        };
    }

    async browse() {
        return (await this.data("/browse.json")).series.filter(s => s.series_id);
    }

    async getPopular(page) {
        const rank = s => s.popularityRank ? parseInt(s.popularityRank) : Infinity;
        const list = (await this.browse()).sort((a, b) => rank(a) - rank(b)).map(s => this.toManga(s));
        return { list, hasNextPage: false };
    }

    get supportsLatest() {
        return true;
    }

    async getLatestUpdates(page) {
        const list = (await this.data("/latest.json")).allSeries.filter(s => s.series_id).map(s => this.toManga(s));
        return { list, hasNextPage: false };
    }

    async search(query, page, filters) {
        const normalize = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, "");
        const q = normalize(query.trim());
        const list = (await this.browse())
            .filter(s => normalize(s.title).includes(q) || this.names(s.altTitles).some(t => normalize(t).includes(q)))
            .map(s => this.toManga(s));
        return { list, hasNextPage: false };
    }

    async getDetail(url) {
        const id = url.match(/series\/(\d+)/)[1];
        const page = await this.data(`/series/${id}.json?id=${id}`);
        const series = page.series;

        let description = new Document(`<div>${series.description || ""}</div>`).selectFirst("div").text.trim();
        const alt = this.names(series.altTitles);
        if (alt.length) {
            description += `${description ? "\n\n" : ""}Alternative names:\n${alt.map(n => `- ${n}`).join("\n")}`;
        }

        const status = { ongoing: 0, completed: 1, hiatus: 2, dropped: 3 }[(series.status || "").toLowerCase()];

        const chapters = page.chapters.map(c => {
            const number = String(parseFloat(c.chapter));
            return {
                name: `Chapter ${number}${c.title ? ` - ${c.title}` : ""}`,
                url: `/series/${c.series_id}/${c.token}`,
                dateUpload: String(parseInt(c.release_date) * 1000),
            };
        });

        return {
            name: series.title,
            imageUrl: this.toManga(series).imageUrl,
            description,
            author: this.names(series.author).join(", "),
            artist: this.names(series.artist).join(", "),
            genre: [...new Set([series.type, ...this.names(series.tags)].filter(g => g))],
            status: status === undefined ? 5 : status,
            chapters,
        };
    }

    async getPageList(url) {
        const [, id, token] = url.match(/series\/(\d+)\/([^\/?#]+)/);
        const chapter = (await this.data(`/series/${id}/${token}.json?id=${id}&token=${token}`)).chapter;
        const images = chapter.images;
        return Object.keys(images)
            .sort((a, b) => parseInt(a) - parseInt(b))
            .map(key => ({
                url: `${CDN}/${chapter.series_id}/${chapter.token}/${encodeURIComponent(images[key].name)}?${chapter.release_date}`,
                headers: this.getHeaders(),
            }));
    }

    getFilterList() {
        return [];
    }
}
