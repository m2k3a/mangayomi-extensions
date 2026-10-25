const mangayomiSources = [{
    "id": 100203066,
    "name": "VoyceMe",
    "lang": "en",
    "baseUrl": "https://www.voyce.me",
    "apiUrl": "https://hasura.voyce.me/v1/graphql",
    "iconUrl": "https://www.google.com/s2/favicons?sz=128&domain=https://www.voyce.me",
    "typeSource": "single",
    "itemType": 0,
    "isNsfw": false,
    "version": "0.1.0",
    "pkgPath": "manga/src/en/voyceme.js"
}];

const STATIC_URL = "https://dlkfxmdtxtzpb.cloudfront.net/";
const PER_PAGE = 20;

// Comics only: types 2 and 4; the others are novels
const LIST_QUERY = (search, orderBy) => `
    query($limit: Int, $offset: Int${search ? ", $searchTerm: String!" : ""}) {
        voyce_series(
            where: {
                publish: { _eq: 1 }, type: { id: { _in: [2, 4] } }
                ${search ? ", title: { _ilike: $searchTerm }" : ""}
            },
            order_by: [${orderBy}],
            limit: $limit,
            offset: $offset
        ) { id slug thumbnail title }
    }`;

const DETAIL_QUERY = `
    query($slug: String!) {
        voyce_series(
            where: { publish: { _eq: 1 }, type: { id: { _in: [2, 4] } }, slug: { _eq: $slug } },
            limit: 1
        ) {
            id slug thumbnail title description status
            author { username }
            genres(order_by: [{ genre: { title: asc } }]) { genre { title } }
            chapters(order_by: [{ created_at: desc }]) { id title created_at }
        }
    }`;

const PAGES_QUERY = `
    query($chapterId: Int!) {
        voyce_chapter_images(where: { chapter_id: { _eq: $chapterId } }, order_by: { sort_order: asc }) { image }
    }`;

class DefaultExtension extends MProvider {
    constructor() {
        super();
        this.client = new Client();
    }

    getHeaders(url) {
        return { "Referer": `${this.source.baseUrl}/`, "Origin": this.source.baseUrl };
    }

    async graphql(query, variables) {
        const res = await this.client.post(
            this.source.apiUrl || "https://hasura.voyce.me/v1/graphql",
            { ...this.getHeaders(), "Accept": "*/*", "Content-Type": "application/json" },
            { query, variables });
        const json = JSON.parse(res.body);
        if (json.errors) throw new Error(json.errors[0].message);
        return json.data;
    }

    async list(page, orderBy, searchTerm) {
        const variables = { limit: PER_PAGE, offset: (page - 1) * PER_PAGE };
        if (searchTerm) variables.searchTerm = searchTerm;
        const data = await this.graphql(LIST_QUERY(!!searchTerm, orderBy), variables);
        const list = data.voyce_series.map(s => ({
            name: s.title,
            imageUrl: STATIC_URL + s.thumbnail,
            link: `/series/${s.slug}`,
        }));
        return { list, hasNextPage: list.length == PER_PAGE };
    }

    async getPopular(page) {
        return await this.list(page, "{ views_counts: { count: desc_nulls_last } }");
    }

    get supportsLatest() {
        return true;
    }

    async getLatestUpdates(page) {
        return await this.list(page, "{ updated_at: desc }");
    }

    async search(query, page, filters) {
        return await this.list(page, "{ views_counts: { count: desc_nulls_last } }", `%${query.trim()}%`);
    }

    async getDetail(url) {
        const slug = url.replace(/^https?:\/\/[^\/]+/, "").replace(/^\/series\//, "").replace(/[\/#?].*$/, "");
        const series = (await this.graphql(DETAIL_QUERY, { slug })).voyce_series[0];
        if (!series) throw new Error("Series not found");

        // The description is HTML with its tags escaped: "&lt;p&gt;Reiyan..."
        const text = html => new Document(`<div>${html}</div>`).selectFirst("div").text.trim();
        const description = text(text(series.description || ""));
        const status = { ongoing: 0, completed: 1 }[series.status];

        // The site lists some chapters twice
        const seen = new Set();
        const chapters = series.chapters.filter(c => !seen.has(c.title) && seen.add(c.title)).map(c => ({
            name: c.title,
            url: `/series/${series.slug}/${c.id}#comic`,
            dateUpload: c.created_at ? String(new Date(`${c.created_at.substring(0, 19)}Z`).valueOf()) : null,
        }));

        return {
            name: series.title,
            imageUrl: STATIC_URL + series.thumbnail,
            description,
            author: series.author ? series.author.username || "" : "",
            genre: series.genres.map(g => g.genre && g.genre.title).filter(g => g),
            status: status === undefined ? 5 : status,
            chapters,
        };
    }

    async getPageList(url) {
        const chapterId = parseInt(url.replace(/#.*$/, "").split("/").pop());
        const images = (await this.graphql(PAGES_QUERY, { chapterId })).voyce_chapter_images;
        return images.map(i => ({
            url: STATIC_URL + i.image,
            headers: { ...this.getHeaders(), "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8" },
        }));
    }

    getFilterList() {
        return [];
    }
}
