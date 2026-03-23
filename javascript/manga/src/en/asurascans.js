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

    get apiBase() {
        // Prefer user-override, then fall back to canonical API base
        return new SharedPreferences().get("overrideApiUrl") || "https://api.asurascans.com";
    }

    get siteBase() {
        return new SharedPreferences().get("overrideSiteUrl") || "https://asurascans.com";
    }

    getHeaders(url) {
        return {
            "Referer": this.siteBase,
            "Accept": "application/json"
        };
    }

    // ──────────────────────────────────────────────────────────────
    // Helper: Convert API series object → Mangayomi list entry
    // ──────────────────────────────────────────────────────────────
    _seriesFromApiItem(item) {
        // public_url = "/comics/slug-f6174291"  →  we store the slug portion for later use
        const link = item.public_url || `/comics/${item.slug}-f6174291`;
        const name = item.title || item.name || "";
        const imageUrl = item.cover || item.cover_url || "";
        return { name, imageUrl, link };
    }

    // ──────────────────────────────────────────────────────────────
    // Helper: Parse API list response → { list, hasNextPage }
    // ──────────────────────────────────────────────────────────────
    _parseMangaList(json) {
        const items = json.data || [];
        const meta  = json.meta  || {};
        const list  = items.map(item => this._seriesFromApiItem(item));
        // API returns { current_page, last_page } or { page, total_pages }
        const currentPage = meta.current_page || meta.page || 1;
        const lastPage    = meta.last_page || meta.total_pages || 1;
        const hasNextPage = currentPage < lastPage;
        return { list, hasNextPage };
    }

    // ──────────────────────────────────────────────────────────────
    // Status mapping  (API uses lowercase strings)
    // ──────────────────────────────────────────────────────────────
    toStatus(status) {
        switch ((status || "").toLowerCase()) {
            case "ongoing":   return 0;
            case "completed": return 1;
            case "hiatus":    return 2;
            case "dropped":   return 3;
            default:          return 5;
        }
    }

    // ──────────────────────────────────────────────────────────────
    // Date parsing  (ISO 8601 from API, no regex acrobatics needed)
    // ──────────────────────────────────────────────────────────────
    parseDate(dateStr) {
        if (!dateStr) return null;
        const ts = Date.parse(dateStr);
        return isNaN(ts) ? null : String(ts);
    }

    // ──────────────────────────────────────────────────────────────
    // Extract the bare slug from a public_url like
    //   /comics/overgeared-f6174291
    // ──────────────────────────────────────────────────────────────
    _slugFromUrl(publicUrl) {
        // "/comics/overgeared-f6174291"  →  "overgeared"
        const seg = publicUrl.replace(/^\/comics\//, "");
        // Remove the trailing uid suffix "-f[hex]"
        return seg.replace(/-f[0-9a-f]{6,8}$/, "");
    }

    // ──────────────────────────────────────────────────────────────
    // Public API
    // ──────────────────────────────────────────────────────────────
    async getPopular(page) {
        const res  = await new Client().get(
            `${this.apiBase}/api/series?order=rating&sort=desc&page=${page}&limit=20`
        );
        return this._parseMangaList(JSON.parse(res.body));
    }

    async getLatestUpdates(page) {
        const res  = await new Client().get(
            `${this.apiBase}/api/series?order=update&sort=desc&page=${page}&limit=20`
        );
        return this._parseMangaList(JSON.parse(res.body));
    }

    async search(query, page, filters) {
        const q    = encodeURIComponent(query || "");
        const res  = await new Client().get(
            `${this.apiBase}/api/series?title=${q}&page=${page}&limit=20`
        );
        return this._parseMangaList(JSON.parse(res.body));
    }

    async getDetail(url) {
        // url is the public_url stored during listing, e.g. "/comics/overgeared-f6174291"
        const slug = this._slugFromUrl(url);

        // Fetch series meta + chapters in parallel
        const [seriesRes, chaptersRes] = await Promise.all([
            new Client().get(`${this.apiBase}/api/series/${slug}`),
            new Client().get(`${this.apiBase}/api/series/${slug}/chapters?page=1&limit=9999`)
        ]);

        const seriesJson   = JSON.parse(seriesRes.body);
        const chaptersJson = JSON.parse(chaptersRes.body);
        const s            = seriesJson.series || seriesJson;

        const imageUrl    = s.cover || s.cover_url || "";
        const description = s.description
            ? s.description.replace(/<[^>]+>/g, "").trim()   // strip HTML tags
            : "";
        const author  = s.author  || "";
        const artist  = s.artist  || "";
        const status  = this.toStatus(s.status);
        const genre   = (s.genres || []).map(g => g.name);

        const rawChapters = chaptersJson.data || [];
        const chapters    = rawChapters.map(ch => ({
            name:       `Chapter ${ch.number}`,
            // Store composite key "seriesSlug/chapterSlug" for getPageList
            url:        `${slug}/${ch.slug}`,
            dateUpload: this.parseDate(ch.published_at)
        }));

        return { imageUrl, description, genre, author, artist, status, chapters };
    }

    async getPageList(url) {
        // url = "seriesSlug/chapterSlug"  (set in getDetail above)
        const [seriesSlug, chapterSlug] = url.split("/");
        const res = await new Client().get(
            `${this.apiBase}/api/series/${seriesSlug}/chapters/${chapterSlug}`
        );
        const json    = JSON.parse(res.body);
        const chapter = (json.data || json).chapter || json;
        const pages   = chapter.pages || [];

        // Return sorted list of page URLs
        return pages
            .map((p, i) => ({ url: p.url, order: p.order ?? i }))
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
                    "dialogMessage": "Base URL of the Asura Scans website"
                }
            },
            {
                "key": "overrideApiUrl",
                "editTextPreference": {
                    "title": "Override API URL",
                    "summary": "https://api.asurascans.com",
                    "value": "https://api.asurascans.com",
                    "dialogTitle": "Override API URL",
                    "dialogMessage": "REST API base URL (usually does not need changing)"
                }
            }
        ];
    }
}
