const mangayomiSources = [{
    "id": 524070078,
    "name": "Asura Scans",
    "lang": "en",
    "baseUrl": "https://asurascans.com",
    "apiUrl": "https://api.asurascans.com",
    "iconUrl": "https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/main/javascript/icon/en.asurascans.png",
    "typeSource": "single",
    "itemType": 0,
    "version": "0.2.0",
    "dateFormat": "",
    "dateFormatLocale": "",
    "pkgPath": "manga/src/en/asurascans.js"
}];

class DefaultExtension extends MProvider {

    getHeaders(url) {
        return { "Referer": this.siteBase };
    }

    get apiBase() {
        return new SharedPreferences().get("overrideApiUrl") || this.source.apiUrl;
    }

    get siteBase() {
        return new SharedPreferences().get("overrideSiteUrl") || this.source.baseUrl;
    }

    // "/comics/overgeared-f6174291" → "overgeared"
    _slugFromUrl(url) {
        const seg = url.replace(/^\/comics\//, "").replace(/^comics\//, "");
        return seg.replace(/-f[0-9a-f]{6,8}$/, "");
    }

    _parseMangaList(json) {
        const items = json.data || [];
        const meta  = json.meta || {};
        const list  = items.map(item => ({
            name:     item.title || item.name || "",
            imageUrl: item.cover || item.cover_url || "",
            link:     item.public_url || `/comics/${item.slug}`
        }));
        const currentPage = meta.current_page || meta.page || 1;
        const lastPage    = meta.last_page    || meta.total_pages || 1;
        return { list, hasNextPage: currentPage < lastPage };
    }

    toStatus(status) {
        switch ((status || "").toLowerCase()) {
            case "ongoing":   return 0;
            case "completed": return 1;
            case "hiatus":    return 2;
            case "dropped":   return 3;
            default:          return 5;
        }
    }

    parseDate(dateStr) {
        if (!dateStr) return null;
        const ts = Date.parse(dateStr);
        return isNaN(ts) ? null : String(ts);
    }

    async getPopular(page) {
        const res = await new Client().get(
            `${this.apiBase}/api/series?order=rating&sort=desc&page=${page}&limit=20`
        );
        return this._parseMangaList(JSON.parse(res.body));
    }

    async getLatestUpdates(page) {
        const res = await new Client().get(
            `${this.apiBase}/api/series?order=update&sort=desc&page=${page}&limit=20`
        );
        return this._parseMangaList(JSON.parse(res.body));
    }

    async search(query, page, filters) {
        const q   = encodeURIComponent(query || "");
        const res = await new Client().get(
            `${this.apiBase}/api/series?title=${q}&page=${page}&limit=20`
        );
        return this._parseMangaList(JSON.parse(res.body));
    }

    async getDetail(url) {
        const slug = this._slugFromUrl(url);

        const seriesRes  = await new Client().get(`${this.apiBase}/api/series/${slug}`);
        const seriesJson = JSON.parse(seriesRes.body);
        const s          = seriesJson.series || seriesJson;

        const description = (s.description || "").replace(/<[^>]+>/g, "").trim(); // HTML strip
        const imageUrl    = s.cover || s.cover_url || "";
        const author      = s.author || "";
        const artist      = s.artist || "";
        const status      = this.toStatus(s.status);
        const genre       = (s.genres || []).map(g => g.name);

        // paginated chapter fetch
        const allChaps = [];
        let pageNum = 1;
        const limit = 100;
        while (true) {
            const chapRes  = await new Client().get(
                `${this.apiBase}/api/series/${slug}/chapters?page=${pageNum}&limit=${limit}`
            );
            const pageData = JSON.parse(chapRes.body).data || [];
            allChaps.push(...pageData);
            if (pageData.length < limit) break;
            pageNum++;
        }

        // chapter url = "seriesSlug||chapterSlug" für getPageList
        const chapters = allChaps.map(ch => ({
            name:       `Chapter ${ch.number}`,
            url:        `${slug}||${ch.slug}`,
            dateUpload: this.parseDate(ch.published_at)
        }));

        return { imageUrl, description, genre, author, artist, status, chapters };
    }

    async getPageList(url) {
        // url = "seriesSlug||chapterSlug"
        const [seriesSlug, chapterSlug] = url.split("||");

        const res     = await new Client().get(
            `${this.apiBase}/api/series/${seriesSlug}/chapters/${chapterSlug}`
        );
        const json    = JSON.parse(res.body);
        const chapter = ((json.data || {}).chapter) || json;
        const pages   = chapter.pages || [];

        return pages
            .map((p, i) => ({ url: p.url, order: p.order != null ? p.order : i }))
            .sort((a, b) => a.order - b.order)
            .map(p => p.url);
    }

    getSourcePreferences() {
        return [
            {
                "key": "overrideSiteUrl",
                "editTextPreference": {
                    "title": "Override Site URL",
                    "summary": "https://asurascans.com",
                    "value": "https://asurascans.com",
                    "dialogTitle": "Override Site URL",
                    "dialogMessage": ""
                }
            },
            {
                "key": "overrideApiUrl",
                "editTextPreference": {
                    "title": "Override API URL",
                    "summary": "https://api.asurascans.com",
                    "value": "https://api.asurascans.com",
                    "dialogTitle": "Override API URL",
                    "dialogMessage": ""
                }
            }
        ];
    }
}
