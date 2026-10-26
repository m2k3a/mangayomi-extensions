const mangayomiSources = [{
    "id": 100203059,
    "name": "MangaGeko",
    "lang": "en",
    "baseUrl": "https://www.mgeko.cc",
    "apiUrl": "",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=https://www.mgeko.cc",
    "typeSource": "single",
    "itemType": 0,
    "isNsfw": false,
    "version": "0.1.0",
    "pkgPath": "manga/src/en/mangageko.js"
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
        return res.body;
    }

    // "/manga/rust/" whether given that or the full url
    path(url) {
        return url.startsWith("http") ? url.replace(/^https?:\/\/[^\/]+/, "") : url;
    }

    // Covers load lazily: the real image is in data-src, src is a placeholder.
    imageOf(img) {
        return img.attr("data-src") || img.attr("src");
    }

    async browse(params) {
        const json = JSON.parse(await this.request(`/browse-comics/data/?${params}`));
        const doc = new Document(json.results_html);
        const list = doc.select(".comic-card").map(card => ({
            name: card.selectFirst(".comic-card__title a").text.trim(),
            imageUrl: this.imageOf(card.selectFirst(".comic-card__cover img")),
            link: this.path(card.selectFirst("a").getHref),
        }));
        return { list, hasNextPage: json.page < json.num_pages };
    }

    async getPopular(page) {
        return await this.browse(`page=${page}&sort=popular_all_time&safe_mode=0`);
    }

    get supportsLatest() {
        return true;
    }

    async getLatestUpdates(page) {
        return await this.browse(`page=${page}&sort=latest&safe_mode=0`);
    }

    async search(query, page, filters) {
        query = query.trim();
        filters = filters && filters.length ? filters : this.getFilterList();
        const [sort, status, type, genres, extras] = filters;
        const isDefault = sort.state == 1 && status.state == 0 && type.state == 0
            && genres.state.every(g => !g.state)
            && extras.state.every(e => !e.state);

        // The browse endpoint matches a title poorly; the site's own search
        // finds it, so a plain query goes there.
        if (query && isDefault) {
            const doc = new Document(await this.request(
                `/search/?search=${encodeURIComponent(query)}&results=${page}`));
            const list = doc.select(".novel-item").map(item => ({
                name: item.selectFirst(".novel-title").text.trim(),
                imageUrl: this.imageOf(item.selectFirst(".novel-cover img")),
                link: this.path(item.selectFirst("a").getHref),
            }));
            const hasNextPage = doc.select("nav.paging a").some(a => a.text.includes("Next"));
            return { list, hasNextPage };
        }

        const params = [`page=${page}`, "safe_mode=0"];
        params.push(`sort=${sort.values[sort.state].value}`);
        if (status.state > 0) params.push(`status=${status.values[status.state].value}`);
        if (type.state > 0) params.push(`type=${type.values[type.state].value}`);
        const included = genres.state.filter(g => g.state == 1).map(g => g.value);
        const excluded = genres.state.filter(g => g.state == 2).map(g => g.value);
        if (included.length) params.push(`include_genres=${encodeURIComponent(included.join(","))}`);
        if (excluded.length) params.push(`exclude_genres=${encodeURIComponent(excluded.join(","))}`);
        extras.state.filter(e => e.state).forEach(e => params.push(`${e.value}=1`));
        if (query) params.push(`q=${encodeURIComponent(query)}`);
        return await this.browse(params.join("&"));
    }

    async getDetail(url) {
        const slug = this.path(url);
        const doc = new Document(await this.request(slug));

        // The site says "Updating" where it has no author or names yet.
        const known = s => s && s.toLowerCase() != "updating";

        let author = doc.selectFirst(".author a").attr("title").trim();
        if (!known(author)) author = "";

        let description = doc.selectFirst(".description").text;
        if (description.includes("Summary is")) {
            description = description.substring(description.indexOf("Summary is") + "Summary is".length);
        }
        description = description.trim();
        const alt = doc.selectFirst(".alternative-title").text;
        const altNames = alt.split(/[•;]/.test(alt) ? /[•;]/ : /,/)
            .map(n => n.trim())
            .filter(known);
        if (altNames.length) {
            description += `${description ? "\n\n" : ""}Alternative Names:\n${altNames.map(n => `- ${n}`).join("\n")}`;
        }

        const genre = doc.select(".categories a[href*=genre]").map(a =>
            a.text.trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase()));

        let status = 5;
        if (doc.select("div.header-stats strong.completed").length) status = 1;
        else if (doc.select("div.header-stats strong.ongoing").length) status = 0;

        const imageUrl = this.imageOf(doc.selectFirst(".cover img"));

        const list = new Document(await this.request(`${slug.replace(/\/?$/, "/")}all-chapters/`));
        const chapters = list.select("ul.chapter-list > li").map(li => {
            const title = li.selectFirst(".chapter-title, .chapter-number").text.trim();
            return {
                name: `Chapter ${title.replace(/-eng-li$/, "")}`,
                url: this.path(li.selectFirst("a").getHref),
                dateUpload: this.parseDate(li.selectFirst(".chapter-update").attr("datetime")),
            };
        });

        return { name: doc.selectFirst("h1.novel-title").text.trim(), imageUrl, description, author, genre, status, chapters };
    }

    // "March 16, 2026, 3:52 p.m.", "Feb. 11, 2026, 3 p.m.", "Sept. 3, 2025, noon"
    parseDate(value) {
        const m = (value || "").match(/^([A-Za-z]+)\.?\s+(\d{1,2}),\s+(\d{4})(?:,\s+(?:(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?|(noon|midnight)))?/i);
        if (!m) return null;
        const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
            .indexOf(m[1].substring(0, 3).toLowerCase());
        if (month < 0) return null;
        let hour = 0;
        if (m[7]) {
            hour = m[7].toLowerCase() == "noon" ? 12 : 0;
        } else if (m[4]) {
            hour = parseInt(m[4]) % 12 + (m[6].toLowerCase() == "p" ? 12 : 0);
        }
        return String(new Date(parseInt(m[3]), month, parseInt(m[2]), hour, parseInt(m[5] || "0")).valueOf());
    }

    async getPageList(url) {
        const doc = new Document(await this.request(this.path(url)));
        return doc.select("#chapter-reader img")
            .map(img => img.attr("src"))
            .filter(src => src && !src.includes("credits-mgeko.png"))
            .map(src => ({ url: src, headers: this.getHeaders() }));
    }

    getFilterList() {
        const option = x => ({ type_name: "SelectOption", name: x[0], value: x[1] });
        return [
            {
                type_name: "SelectFilter",
                name: "Sort by",
                state: 1,
                values: [
                    ["New", "recently_added"],
                    ["Updated", "latest"],
                    ["Popular (Daily)", "popular_daily"],
                    ["Popular (Weekly)", "popular_weekly"],
                    ["Popular (Monthly)", "popular_monthly"],
                    ["Popular (All Time)", "popular_all_time"],
                    ["Rating", "rating"],
                    ["Title (A-Z)", "az"],
                    ["Title (Z-A)", "za"],
                ].map(option)
            },
            {
                type_name: "SelectFilter",
                name: "Status",
                state: 0,
                values: [["Any", ""], ["Ongoing", "Ongoing"], ["Completed", "Completed"], ["Hiatus", "Hiatus"]].map(option)
            },
            {
                type_name: "SelectFilter",
                name: "Type",
                state: 0,
                values: [["Any", ""], ["Manga", "Manga"], ["Manhwa", "Manhwa"], ["Manhua", "Manhua"], ["Webtoon", "Webtoon"]].map(option)
            },
            {
                type_name: "GroupFilter",
                name: "Genre",
                state: [
                    "Action", "Adventure", "Comedy", "Cooking", "Manga", "Drama", "Fantasy",
                    "Gender bender", "Harem", "Historical", "Horror", "Isekai", "Josei",
                    "Manhua", "Manhwa", "Martial arts", "Mature", "Mecha", "Medical",
                    "Mystery", "One shot", "Psychological", "Romance", "School life",
                    "Sci fi", "Seinen", "Shoujo", "Shounen", "Slice of life", "Sports",
                    "Supernatural", "Tragedy", "Webtoons", "Ladies",
                ].map(g => ({ type_name: "TriState", name: g, value: g }))
            },
            {
                type_name: "GroupFilter",
                name: "Extras",
                state: [
                    ["Only completed series", "only_completed"],
                    ["At least 50+ chapters translated", "only_translated"],
                    ["Hide long hiatus (> 6 months)", "hide_on_break"],
                ].map(x => ({ type_name: "CheckBox", name: x[0], value: x[1] }))
            },
        ];
    }
}
