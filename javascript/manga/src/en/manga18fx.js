const mangayomiSources = [{
    "id": 100203060,
    "name": "Manga18fx",
    "lang": "en",
    "baseUrl": "https://manga18fx.com",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=https://manga18fx.com",
    "typeSource": "single",
    "itemType": 0,
    "isNsfw": true,
    "version": "0.1.0",
    "pkgPath": "manga/src/en/manga18fx.js"
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

    path(url) {
        return url.startsWith("http") ? url.replace(/^https?:\/\/[^\/]+/, "") : url;
    }

    imageOf(img) {
        return img.attr("data-src") || img.attr("src");
    }

    // Untranslated raws are mixed into every listing; they are only shown
    // when browsing the Raw category.
    isRaw(entry) {
        return /-raw\/?$/.test(entry.link) || / raw$/i.test(entry.name);
    }

    async list(slug, rawListing) {
        const doc = await this.request(slug);
        const list = doc.select("div.page-item").map(item => {
            const link = item.selectFirst("h3 a");
            return {
                name: link.text.trim(),
                imageUrl: this.imageOf(item.selectFirst("img")),
                link: this.path(link.getHref),
            };
        }).filter(entry => rawListing || !this.isRaw(entry));
        return { list, hasNextPage: doc.select("#blog-pager li.next a").length > 0 };
    }

    async getPopular(page) {
        return await this.list(`/hot-manga?page=${page}`);
    }

    get supportsLatest() {
        return true;
    }

    async getLatestUpdates(page) {
        return await this.list(`/page/${page}`);
    }

    async search(query, page, filters) {
        query = query.trim();
        if (query) {
            // The site answers HTTP 500 to an ASCII apostrophe
            return await this.list(`/search?q=${encodeURIComponent(query.replace(/'/g, "’"))}&page=${page}`);
        }
        filters = filters && filters.length ? filters : this.getFilterList();
        const value = f => f.values[f.state].value;
        const [, genre, category, sort] = filters;
        const listing = value(genre) || value(category);
        const order = value(sort);
        if (!listing) {
            return await this.list(`/page/${page}${order ? `?orderby=${order}` : ""}`);
        }
        return await this.list(`/${listing}/${page}${order ? `?orderby=${order}` : ""}`, listing == "manhwa-raw");
    }

    async getDetail(url) {
        const doc = await this.request(this.path(url));

        // "Genre(s)", "Author(s)", "Status": a heading and its content
        const info = label => doc.select(".post-content_item")
            .find(item => item.selectFirst(".summary-heading").text.trim().toLowerCase().startsWith(label));
        const known = s => s && s != "Updating" && s != "N/A";
        const names = label => {
            const item = info(label);
            if (!item) return [];
            const links = item.select(".summary-content a").map(a => a.text.trim());
            return (links.length ? links : [item.selectFirst(".summary-content").text.trim()]).filter(known);
        };

        let description = doc.select(".dsct p").map(p => p.text.trim()).filter(p => p).join("\n\n")
            || doc.selectFirst(".dsct").text.trim();
        const alt = names("alternative").join(", ");
        if (alt) description += `${description ? "\n\n" : ""}Alternative names: ${alt}`;

        const statusText = (names("status")[0] || "").toLowerCase();
        const status = statusText == "ongoing" ? 0 : statusText == "completed" ? 1 : 5;

        const chapters = doc.select("ul.row-content-chapter li").map(li => {
            const link = li.selectFirst("a");
            return {
                name: link.text.trim(),
                url: this.path(link.getHref),
                dateUpload: this.parseDate(li.selectFirst(".chapter-time").text),
            };
        });

        return {
            name: doc.selectFirst(".post-title h1").text.trim(),
            imageUrl: this.imageOf(doc.selectFirst(".summary_image img")),
            description,
            author: names("author").join(", "),
            artist: names("artist").join(", "),
            genre: names("genre"),
            status,
            chapters,
        };
    }

    // "23 Oct 26" or "09 Oct 2026"
    parseDate(value) {
        const m = (value || "").trim().match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{2}|\d{4})$/);
        if (!m) return null;
        const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
            .indexOf(m[2].toLowerCase());
        if (month < 0) return null;
        const year = m[3].length == 2 ? 2000 + parseInt(m[3]) : parseInt(m[3]);
        return String(new Date(year, month, parseInt(m[1])).valueOf());
    }

    async getPageList(url) {
        // Chapters saved by the older Madara version of the site are absolute
        // and end in ?style=list
        const doc = await this.request(this.path(url).replace(/\?style=list$/, ""));
        return doc.select(".read-content img")
            .map(img => this.imageOf(img))
            .filter(src => src)
            .map(src => ({ url: src, headers: this.getHeaders() }));
    }

    getFilterList() {
        const option = x => ({ type_name: "SelectOption", name: x[0], value: x[1] });
        const genres = [
            "Action", "Adventure", "Comedy", "Drama", "Ecchi", "Fantasy", "Harem", "Isekai",
            "Manhua", "Manhwa", "Mature", "Mystery", "Psychological", "Reincarnation", "Romance",
            "School Life", "Seinen", "Shoujo", "Shounen", "Supernatural", "Thriller", "Tragedy",
            "Uncensored Manhwa",
        ].map(g => [g, `manga-genre/${g.toLowerCase().replace(/ /g, "-")}`]);
        return [
            { type_name: "HeaderFilter", name: "Ignored when searching text; Genre takes priority over Category" },
            {
                type_name: "SelectFilter",
                name: "Genre",
                state: 0,
                values: [["All", ""], ...genres].map(option)
            },
            {
                type_name: "SelectFilter",
                name: "Category",
                state: 0,
                values: [["All", ""], ["Raw", "manhwa-raw"]].map(option)
            },
            {
                type_name: "SelectFilter",
                name: "Sort by",
                state: 0,
                values: [["Default", ""], ["Newest", "latest"], ["Rating", "rating"], ["Most views", "views"]].map(option)
            },
        ];
    }
}
