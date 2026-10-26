const mangayomiSources = [{
    "id": 100203061,
    "name": "Manga Demon",
    "lang": "en",
    "baseUrl": "https://demonicscans.org",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=https://demonicscans.org",
    "typeSource": "single",
    "itemType": 0,
    "isNsfw": false,
    "version": "0.1.0",
    "pkgPath": "manga/src/en/mangademon.js"
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
        // Chapter links are "chaptered.php?manga=1&amp;chapter=2"
        url = url.replace(/&amp;/g, "&");
        url = url.startsWith("http") ? url.replace(/^https?:\/\/[^\/]+/, "") : url;
        return url.startsWith("/") ? url : `/${url}`;
    }

    // Image files are named after the title, spaces and all
    image(src) {
        if (!src) return src;
        return (src.startsWith("http") ? src : `${this.source.baseUrl}${this.path(src)}`).replace(/ /g, "%20");
    }

    hasNext(doc) {
        return doc.select("div.pagination > ul > a > li").some(li => li.text.trim() == "Next");
    }

    async advanced(params) {
        const doc = await this.request(`/advanced.php?${params}`);
        const list = doc.select("div#advanced-content > div.advanced-element").map(item => ({
            name: item.selectFirst("a").attr("title") || item.selectFirst("h1").text.trim(),
            imageUrl: this.image(item.selectFirst("img").attr("src")),
            link: this.path(item.selectFirst("a").getHref),
        }));
        return { list, hasNextPage: this.hasNext(doc) };
    }

    async getPopular(page) {
        return await this.advanced(`list=${page}&status=all&orderby=VIEWS%20DESC`);
    }

    get supportsLatest() {
        return true;
    }

    async getLatestUpdates(page) {
        const doc = await this.request(`/lastupdates.php?list=${page}`);
        const list = doc.select("div#updates-container > div.updates-element")
            .filter(item => !item.select(".toffee-badge").length)
            .map(item => {
                const link = item.selectFirst("div.updates-element-info a");
                return {
                    name: link.text.trim(),
                    imageUrl: this.image(item.selectFirst("div.thumb img").attr("src")),
                    link: this.path(link.getHref),
                };
            });
        return { list, hasNextPage: this.hasNext(doc) };
    }

    async search(query, page, filters) {
        query = query.trim();
        if (query) {
            // Search returns every match at once
            if (page > 1) return { list: [], hasNextPage: false };
            const doc = await this.request(`/search.php?manga=${encodeURIComponent(query)}`);
            const list = doc.select("a[href]").filter(a => a.select("div.seach-right").length).map(a => ({
                name: a.selectFirst("div.seach-right > div").text.trim(),
                imageUrl: this.image(a.selectFirst("img").attr("src")),
                link: this.path(a.getHref),
            }));
            return { list, hasNextPage: false };
        }

        filters = filters && filters.length ? filters : this.getFilterList();
        const [, sort, status, genres] = filters;
        const params = [`list=${page}`];
        params.push(`status=${status.values[status.state].value}`);
        params.push(`orderby=${encodeURIComponent(sort.values[sort.state].value)}`);
        genres.state.filter(g => g.state).forEach(g => params.push(`genre%5B%5D=${g.value}`));
        return await this.advanced(params.join("&"));
    }

    async getDetail(url) {
        const doc = await this.request(this.path(url));
        const info = doc.selectFirst("div#manga-info-container");

        const stat = label => {
            const row = info.select("div#manga-info-stats > div").find(div => {
                const cells = div.select("li");
                return cells.length > 1 && cells[0].text.trim() == label;
            });
            return row ? row.select("li")[1].text.trim() : "";
        };

        // "... The Summary is <br><br> actual summary"
        let description = info.selectFirst("div#manga-info-rightColumn div.white-font").text.trim();
        if (description.includes("The Summary is")) {
            description = description.substring(description.indexOf("The Summary is") + "The Summary is".length).trim();
        }
        const alt = stat("Alternatives");
        if (alt) description += `${description ? "\n\n" : ""}Alternative names: ${alt}`;

        let author = stat("Author");
        if (author.toLowerCase().includes("updating")) author = "";

        const statusText = stat("Status").toLowerCase();
        const status = statusText.includes("ongoing") ? 0 : statusText.includes("completed") ? 1 : 5;

        const chapters = info.select("div#chapters-list a.chplinks").map(a => {
            const date = a.selectFirst("span").text.trim();
            return {
                name: a.text.replace(date, "").trim(),
                url: this.path(a.getHref),
                dateUpload: this.parseDate(date),
            };
        });

        return {
            name: info.selectFirst("h1.big-fat-titles").text.trim(),
            imageUrl: this.image(info.selectFirst("div#manga-page img").attr("src")),
            description,
            author,
            genre: info.select("div.genres-list > li").map(li => li.text.trim()),
            status,
            chapters,
        };
    }

    // "2026-10-19"
    parseDate(value) {
        const m = (value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return null;
        return String(new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])).valueOf());
    }

    async getPageList(url) {
        const doc = await this.request(this.path(url));
        return doc.select("div > img.imgholder")
            .map(img => img.attr("src"))
            // The first is an ad for the site's paid plan
            .filter(src => src && src.startsWith("http"))
            .map(src => ({ url: this.image(src), headers: this.getHeaders() }));
    }

    getFilterList() {
        const option = x => ({ type_name: "SelectOption", name: x[0], value: x[1] });
        return [
            { type_name: "HeaderFilter", name: "Ignored when searching text" },
            {
                type_name: "SelectFilter",
                name: "Sort",
                state: 0,
                values: [["Top Views", "VIEWS DESC"], ["A To Z", "NAME ASC"]].map(option)
            },
            {
                type_name: "SelectFilter",
                name: "Status",
                state: 0,
                values: [["All", "all"], ["Ongoing", "ongoing"], ["Completed", "completed"]].map(option)
            },
            {
                type_name: "GroupFilter",
                name: "Genre",
                state: [
                    ["Action", "1"], ["Adventure", "2"], ["Comedy", "3"], ["Cooking", "34"],
                    ["Doujinshi", "25"], ["Drama", "4"], ["Ecchi", "19"], ["Fantasy", "5"],
                    ["Gender Bender", "30"], ["Harem", "10"], ["Historical", "28"], ["Horror", "8"],
                    ["Isekai", "33"], ["Josei", "31"], ["Martial Arts", "6"], ["Mature", "22"],
                    ["Mecha", "32"], ["Mystery", "15"], ["One Shot", "26"], ["Psychological", "11"],
                    ["Romance", "12"], ["School Life", "13"], ["Sci-fi", "16"], ["Seinen", "17"],
                    ["Shoujo", "14"], ["Shoujo Ai", "23"], ["Shounen", "7"], ["Shounen Ai", "29"],
                    ["Slice of Life", "21"], ["Smut", "27"], ["Sports", "20"], ["Supernatural", "9"],
                    ["Tragedy", "18"], ["Webtoons", "24"],
                ].map(x => ({ type_name: "CheckBox", name: x[0], value: x[1] }))
            },
        ];
    }
}
