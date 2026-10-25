// Sites built on Iken: the catalog and reader are served by api.<site>
const mangayomiSources = [{
    "id": 100203062,
    "name": "Vortex Scans",
    "lang": "en",
    "baseUrl": "https://vortexscans.org",
    "apiUrl": "https://api.vortexscans.org",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=https://vortexscans.org",
    "typeSource": "single",
    "itemType": 0,
    "isNsfw": false,
    "version": "0.1.0",
    "pkgPath": "manga/src/en/iken.js"
}, {
    "id": 100203063,
    "name": "Hivetoons",
    "lang": "en",
    "baseUrl": "https://hivetoons.org",
    "apiUrl": "https://api.hivetoons.org",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=https://hivetoons.org",
    "typeSource": "single",
    "itemType": 0,
    "isNsfw": false,
    "version": "0.1.0",
    "pkgPath": "manga/src/en/iken.js"
}];

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    getHeaders(url) {
        return { "Referer": `${this.source.baseUrl}/`, "Origin": this.source.baseUrl };
    }

    get api() {
        return this.source.apiUrl || this.source.baseUrl.replace("https://", "https://api.");
    }

    async get(slug) {
        const res = await this.client.get(`${this.api}${slug}`, this.getHeaders());
        return JSON.parse(res.body);
    }

    isNovel(post) {
        return post.isNovel || (post.seriesType || "").toUpperCase() == "NOVEL";
    }

    async query(page, params) {
        const perPage = 18;
        const data = await this.get(`/api/query?perPage=${perPage}&page=${page}&${params}`);
        const list = data.posts.filter(post => !this.isNovel(post)).map(post => ({
            name: post.postTitle,
            imageUrl: post.featuredImage,
            link: `/series/${post.slug}`,
        }));
        return { list, hasNextPage: data.totalCount > page * perPage };
    }

    async getPopular(page) {
        return await this.query(page, "searchTerm=&orderBy=totalViews");
    }

    get supportsLatest() {
        return true;
    }

    async getLatestUpdates(page) {
        return await this.query(page, "searchTerm=&orderBy=lastChapterAddedAt");
    }

    async search(query, page, filters) {
        filters = filters && filters.length ? filters : this.getFilterList();
        const params = [`searchTerm=${encodeURIComponent(query.trim())}`];
        filters.filter(f => f.type_name == "SelectFilter").forEach(f => {
            const value = f.values[f.state].value;
            if (value) params.push(`${f.type}=${value}`);
        });
        return await this.query(page, params.join("&"));
    }

    // "/series/<slug>", or "/manga/<slug>/" from when Hivetoons ran on WordPress
    slugOf(url) {
        return url.replace(/^https?:\/\/[^\/]+/, "").replace(/^\/(series|manga)\//, "").replace(/[\/#].*$/, "");
    }

    async getDetail(url) {
        const slug = this.slugOf(url);
        const post = (await this.get(`/api/post?postSlug=${encodeURIComponent(slug)}`)).post;
        if (!post) throw new Error(`"${slug}" is not on ${this.source.name} any more; search for it by name`);

        let description = new Document(`<div>${(post.postContent || "").replace(/\n/g, "<br>")}</div>`)
            .selectFirst("div").text.trim();
        if (post.alternativeTitles) {
            description += `${description ? "\n\n" : ""}Alternative names: ${post.alternativeTitles}`;
        }

        const type = { MANGA: "Manga", MANHUA: "Manhua", MANHWA: "Manhwa" }[post.seriesType];
        const genre = [...new Set([type, ...(post.genres || []).map(g => g.name.trim())].filter(g => g))];

        const status = {
            ONGOING: 0, COMING_SOON: 0, MASS_RELEASED: 0, COMPLETED: 1, CANCELLED: 3, DROPPED: 3,
        }[post.seriesStatus];

        // Chapters bought with coins or not yet free are left out
        const chapters = (await this.get(`/api/chapters?postId=${post.id}`)).post.chapters
            .filter(c => !c.isLocked && !c.isTimeLocked && c.isAccessible !== false && !c.isPermanentlyLocked)
            .map(c => ({
                name: `Chapter ${c.number}${c.title ? ` - ${c.title}` : ""}`,
                url: `/series/${slug}/${c.slug}#${c.id}`,
                dateUpload: c.createdAt ? String(new Date(c.createdAt).valueOf()) : null,
            }));

        return {
            name: post.postTitle,
            imageUrl: post.featuredImage,
            description,
            author: post.author || "",
            artist: post.artist || "",
            genre,
            status: status === undefined ? 5 : status,
            chapters,
        };
    }

    async getPageList(url) {
        const id = url.substring(url.lastIndexOf("#") + 1);
        const chapter = (await this.get(`/api/chapter?chapterId=${id}`)).chapter;
        if (chapter.isLockedByCoins || chapter.isPermanentlyLocked || chapter.isShortLinkLocked) {
            throw new Error("This chapter is locked on the site");
        }
        return chapter.images
            .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity))
            .map(image => ({ url: image.url.replace(/ /g, "%20"), headers: this.getHeaders() }));
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
            select("Status", "seriesStatus", [
                ["All", ""], ["Ongoing", "ONGOING"], ["Completed", "COMPLETED"], ["Cancelled", "CANCELLED"],
                ["Dropped", "DROPPED"], ["Coming soon", "COMING_SOON"], ["Mass released", "MASS_RELEASED"],
            ]),
            select("Type", "seriesType", [["All", ""], ["Manga", "MANGA"], ["Manhua", "MANHUA"], ["Manhwa", "MANHWA"]]),
            select("Sort by", "orderBy", [
                ["Last chapter", "lastChapterAddedAt"], ["Views", "totalViews"], ["Added", "createdAt"],
                ["Chapters", "chaptersCount"], ["Title", "postTitle"],
            ]),
            select("Direction", "orderDirection", [["Descending", "desc"], ["Ascending", "asc"]]),
        ];
    }
}
