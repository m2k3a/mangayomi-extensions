const mangayomiSources = [{
    "id": 100203064,
    "name": "Thunder Scans",
    "lang": "en",
    "baseUrl": "https://en-thunderscans.com",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=https://en-thunderscans.com",
    "typeSource": "single",
    "itemType": 0,
    "isNsfw": false,
    "version": "0.1.0",
    "pkgPath": "manga/src/en/thunderscans.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    getHeaders(url) {
        return { "Referer": `${this.source.baseUrl}/` };
    }

    async request(slug) {
        const url = slug.startsWith("http") ? slug : `${this.source.baseUrl}${slug}`;
        const res = await this.client.get(url, this.getHeaders());
        return new Document(res.body);
    }

    // Some series get a number in front of their slug, "/comics/0086250808-tamer/",
    // which changes now and then. The site redirects the slug without it, so
    // that is what gets saved.
    path(url) {
        return url.replace(/^https?:\/\/[^\/]+/, "").replace(/^\/comics\/\d{6,}-/, "/comics/");
    }

    imageOf(img) {
        const src = img.attr("src");
        return !src || src.startsWith("data:") ? img.attr("data-src") : src;
    }

    async list(slug) {
        const doc = await this.request(slug);
        const list = doc.select(".listupd .bs .bsx").map(item => {
            const link = item.selectFirst("a");
            return {
                name: item.selectFirst(".tt").text.trim() || link.attr("title"),
                imageUrl: this.imageOf(item.selectFirst("img")),
                link: this.path(link.getHref),
            };
        });
        const hasNextPage = doc.select("a.next.page-numbers, .hpage a.r").length > 0;
        return { list, hasNextPage };
    }

    async getPopular(page) {
        return await this.list(`/comics/?page=${page}&order=popular`);
    }

    get supportsLatest() {
        return true;
    }

    async getLatestUpdates(page) {
        return await this.list(`/comics/?page=${page}&order=update`);
    }

    async search(query, page, filters) {
        query = query.trim();
        if (query) {
            return await this.list(`/page/${page}/?s=${encodeURIComponent(query)}`);
        }
        filters = filters && filters.length ? filters : this.getFilterList();
        const params = [`page=${page}`];
        filters.filter(f => f.type_name == "SelectFilter").forEach(f => {
            const value = f.values[f.state].value;
            if (value) params.push(`${f.type}=${value}`);
        });
        return await this.list(`/comics/?${params.join("&")}`);
    }

    async getDetail(url) {
        const doc = await this.request(this.path(url));

        const info = label => {
            const row = doc.select(".tsinfo .imptdt").find(div => div.selectFirst("h1").text.trim() == label);
            return row ? row.selectFirst("i").text.trim() : "";
        };

        let description = doc.select(".entry-content[itemprop=description] p").map(p => p.text.trim())
            .filter(p => p).join("\n\n");
        const alt = doc.selectFirst(".alternative .desktop-titles").text.trim();
        if (alt) description += `${description ? "\n\n" : ""}Alternative names: ${alt}`;

        const statusText = info("Status").toLowerCase();
        const status = statusText == "ongoing" ? 0 : statusText == "completed" ? 1
            : statusText == "hiatus" ? 2 : statusText == "dropped" ? 3 : 5;

        const genre = doc.select(".mgen a").map(a => a.text.trim());
        const type = info("Type");
        if (type && !genre.includes(type)) genre.push(type);

        // Chapters sold for coins have no link, only a dialog to buy them
        const chapters = doc.select("#chapterlist li a[href]")
            .filter(a => a.getHref.startsWith("http") || a.getHref.startsWith("/"))
            .map(a => ({
                name: a.selectFirst(".chapternum").text.replace(/\s+/g, " ").trim(),
                url: this.path(a.getHref),
                dateUpload: this.parseDate(a.selectFirst(".chapterdate").text),
            }));

        return {
            name: doc.selectFirst("h1.entry-title").text.trim(),
            imageUrl: this.imageOf(doc.selectFirst(".thumb img")),
            description,
            author: "",
            genre,
            status,
            chapters,
        };
    }

    // "October 24, 2026"
    parseDate(value) {
        const m = (value || "").trim().match(/^([A-Za-z]+) (\d{1,2}), (\d{4})$/);
        if (!m) return null;
        const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
            .indexOf(m[1].substring(0, 3).toLowerCase());
        if (month < 0) return null;
        return String(new Date(parseInt(m[3]), month, parseInt(m[2])).valueOf());
    }

    async getPageList(url) {
        const res = await this.client.get(`${this.source.baseUrl}${this.path(url)}`, this.getHeaders());
        // The reader is filled from ts_reader.run({... "sources": [{"images": [...]}]})
        const m = res.body.match(/ts_reader\.run\((\{.*?\})\);/s);
        let images = [];
        if (m) {
            images = JSON.parse(m[1]).sources[0].images;
        } else {
            images = new Document(res.body).select("#readerarea img").map(img => this.imageOf(img));
        }
        return images.filter(src => src).map(src => ({ url: src, headers: this.getHeaders() }));
    }

    getFilterList() {
        const select = (name, type, values) => ({
            type_name: "SelectFilter",
            name,
            type,
            state: 0,
            values: values.map(x => ({ type_name: "SelectOption", name: x[0], value: x[1] })),
        });
        return [
            { type_name: "HeaderFilter", name: "Ignored when searching text" },
            select("Status", "status", [["All", ""], ["Ongoing", "ongoing"], ["Completed", "completed"], ["Hiatus", "hiatus"]]),
            select("Type", "type", [["All", ""], ["Manga", "manga"], ["Manhwa", "manhwa"], ["Manhua", "manhua"], ["Comic", "comic"]]),
            select("Sort by", "order", [
                ["Default", ""], ["A-Z", "title"], ["Z-A", "titlereverse"], ["Update", "update"],
                ["Added", "latest"], ["Popular", "popular"],
            ]),
        ];
    }
}
