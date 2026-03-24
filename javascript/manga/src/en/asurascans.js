const mangayomiSources = [
	{
		id: 524070078,
		name: "Asura Scans",
		lang: "en",
		baseUrl: "https://asurascans.com",
		apiUrl: "https://api.asurascans.com",
		iconUrl:
			"https://raw.githubusercontent.com/MorningOctober/manga-extensions/main/javascript/icon/en.asurascans.png",
		typeSource: "single",
		itemType: 0,
		version: "0.2.5",
		dateFormat: "",
		dateFormatLocale: "",
		pkgPath: "manga/src/en/asurascans.js",
	},
];

class DefaultExtension extends MProvider {
	getHeaders(_url) {
		return { Referer: this.siteBase };
	}

	get apiBase() {
		return new SharedPreferences().get("overrideApiUrl") || this.source.apiUrl;
	}

	get siteBase() {
		return (
			new SharedPreferences().get("overrideSiteUrl") || this.source.baseUrl
		);
	}

	// "/comics/overgeared-f6174291" → "overgeared"
	_slugFromUrl(url) {
		const seg = url.replace(/^\/comics\//, "").replace(/^comics\//, "");
		return seg.replace(/-f[0-9a-f]{6,8}$/, "");
	}

	_parseMangaList(json) {
		const items = json.data || [];
		const meta = json.meta || {};
		const list = items.map((item) => ({
			name: item.title || item.name || "",
			imageUrl: item.cover || item.cover_url || "",
			link: item.public_url || `/comics/${item.slug}`,
		}));
		return { list, hasNextPage: meta.has_more === true };
	}

	toStatus(status) {
		switch ((status || "").toLowerCase()) {
			case "ongoing":
				return 0;
			case "completed":
				return 1;
			case "hiatus":
				return 2;
			case "dropped":
				return 3;
			default:
				return 5;
		}
	}

	parseDate(dateStr) {
		if (!dateStr) return null;
		const ts = Date.parse(dateStr);
		return Number.isNaN(ts) ? null : String(ts);
	}

	async getPopular(page) {
		const offset = (page - 1) * 20;
		const res = await new Client().get(
			`${this.apiBase}/api/series?sort=rating&order=desc&offset=${offset}&limit=20`,
		);
		return this._parseMangaList(JSON.parse(res.body));
	}

	async getLatestUpdates(page) {
		const offset = (page - 1) * 20;
		const res = await new Client().get(
			`${this.apiBase}/api/series?sort=latest&order=desc&offset=${offset}&limit=20`,
		);
		return this._parseMangaList(JSON.parse(res.body));
	}

	async search(query, page, filters) {
		const q = encodeURIComponent(query || "");
		const offset = (page - 1) * 20;

		const sortBy =
			filters?.[0]?.values?.[filters[0].state]?.value || "rating";
		const sortDir =
			filters?.[1]?.values?.[filters[1].state]?.value || "desc";
		const status = filters?.[2]?.values?.[filters[2].state]?.value || "";
		const type = filters?.[3]?.values?.[filters[3].state]?.value || "";
		const genres = (filters?.[4]?.state || [])
			.filter((cb) => cb.state)
			.map((cb) => cb.value)
			.join(",");

		let url = `${this.apiBase}/api/series?offset=${offset}&limit=20&sort=${sortBy}&order=${sortDir}`;
		if (q) url += `&title=${q}`;
		if (status) url += `&status=${status}`;
		if (type) url += `&type=${type}`;
		if (genres) url += `&genres=${encodeURIComponent(genres)}`;

		const res = await new Client().get(url);
		return this._parseMangaList(JSON.parse(res.body));
	}

	getFilterList() {
		return [
			{
				type_name: "SelectFilter",
				name: "Sort By",
				state: 0,
				values: [
					{ type_name: "SelectOption", name: "Rating", value: "rating" },
					{
						type_name: "SelectOption",
						name: "Latest Update",
						value: "latest",
					},
					{
						type_name: "SelectOption",
						name: "Bookmarks",
						value: "bookmarks",
					},
				],
			},
			{
				type_name: "SelectFilter",
				name: "Sort Order",
				state: 1,
				values: [
					{ type_name: "SelectOption", name: "Ascending", value: "asc" },
					{ type_name: "SelectOption", name: "Descending", value: "desc" },
				],
			},
			{
				type_name: "SelectFilter",
				name: "Status",
				state: 0,
				values: [
					{ type_name: "SelectOption", name: "All", value: "" },
					{ type_name: "SelectOption", name: "Ongoing", value: "ongoing" },
					{
						type_name: "SelectOption",
						name: "Completed",
						value: "completed",
					},
					{ type_name: "SelectOption", name: "Hiatus", value: "hiatus" },
					{ type_name: "SelectOption", name: "Dropped", value: "dropped" },
				],
			},
			{
				type_name: "SelectFilter",
				name: "Type",
				state: 0,
				values: [
					{ type_name: "SelectOption", name: "All", value: "" },
					{ type_name: "SelectOption", name: "Manhwa", value: "manhwa" },
					{ type_name: "SelectOption", name: "Manga", value: "manga" },
					{ type_name: "SelectOption", name: "Manhua", value: "manhua" },
				],
			},
			{
				type_name: "GroupFilter",
				name: "Genres",
				state: [
					{ type_name: "CheckBox", name: "Action", value: "action" },
					{ type_name: "CheckBox", name: "Adventure", value: "adventure" },
					{ type_name: "CheckBox", name: "Comedy", value: "comedy" },
					{ type_name: "CheckBox", name: "Crazy MC", value: "crazy-mc" },
					{ type_name: "CheckBox", name: "Demon", value: "demon" },
					{ type_name: "CheckBox", name: "Dungeons", value: "dungeons" },
					{ type_name: "CheckBox", name: "Fantasy", value: "fantasy" },
					{ type_name: "CheckBox", name: "Game", value: "game" },
					{ type_name: "CheckBox", name: "Genius MC", value: "genius-mc" },
					{ type_name: "CheckBox", name: "Isekai", value: "isekai" },
					{ type_name: "CheckBox", name: "Kuchikuchi", value: "kuchikuchi" },
					{ type_name: "CheckBox", name: "Magic", value: "magic" },
					{
						type_name: "CheckBox",
						name: "Martial Arts",
						value: "martial-arts",
					},
					{ type_name: "CheckBox", name: "Murim", value: "murim" },
					{ type_name: "CheckBox", name: "Mystery", value: "mystery" },
					{
						type_name: "CheckBox",
						name: "Necromancer",
						value: "necromancer",
					},
					{
						type_name: "CheckBox",
						name: "Overpowered",
						value: "overpowered",
					},
					{ type_name: "CheckBox", name: "Regression", value: "regression" },
					{
						type_name: "CheckBox",
						name: "Reincarnation",
						value: "reincarnation",
					},
					{ type_name: "CheckBox", name: "Revenge", value: "revenge" },
					{ type_name: "CheckBox", name: "Romance", value: "romance" },
					{
						type_name: "CheckBox",
						name: "School Life",
						value: "school-life",
					},
					{ type_name: "CheckBox", name: "Sci-fi", value: "sci-fi" },
					{ type_name: "CheckBox", name: "Shoujo", value: "shoujo" },
					{ type_name: "CheckBox", name: "Shounen", value: "shounen" },
					{ type_name: "CheckBox", name: "System", value: "system" },
					{ type_name: "CheckBox", name: "Tower", value: "tower" },
					{ type_name: "CheckBox", name: "Tragedy", value: "tragedy" },
					{ type_name: "CheckBox", name: "Villain", value: "villain" },
					{ type_name: "CheckBox", name: "Violence", value: "violence" },
				],
			},
		];
	}

	async getDetail(url) {
		const slug = this._slugFromUrl(url);

		const seriesRes = await new Client().get(
			`${this.apiBase}/api/series/${slug}`,
		);
		const seriesJson = JSON.parse(seriesRes.body);
		const s = seriesJson.series || seriesJson;

		const description = (s.description || "").replace(/<[^>]+>/g, "").trim(); // HTML strip
		const imageUrl = s.cover || s.cover_url || "";
		const author = s.author || "";
		const artist = s.artist || "";
		const status = this.toStatus(s.status);
		const genre = (s.genres || []).map((g) => g.name);

		// paginated chapter fetch
		const allChaps = [];
		let pageNum = 1;
		const limit = 100;
		while (true) {
			const chapRes = await new Client().get(
				`${this.apiBase}/api/series/${slug}/chapters?page=${pageNum}&limit=${limit}`,
			);
			const pageData = JSON.parse(chapRes.body).data || [];
			allChaps.push(...pageData);
			if (pageData.length < limit) break;
			pageNum++;
		}

		// chapter url = "seriesSlug||chapterSlug" für getPageList
		const chapters = allChaps.map((ch) => ({
			name: `Chapter ${ch.number}`,
			url: `${slug}||${ch.slug}`,
			dateUpload: this.parseDate(ch.published_at),
		}));

		return { imageUrl, description, genre, author, artist, status, chapters };
	}

	async getPageList(url) {
		// url = "seriesSlug||chapterSlug"
		const [seriesSlug, chapterSlug] = url.split("||");

		const res = await new Client().get(
			`${this.apiBase}/api/series/${seriesSlug}/chapters/${chapterSlug}`,
		);
		const json = JSON.parse(res.body);
		const chapter = json.data?.chapter || json;
		const pages = chapter.pages || [];

		return pages
			.map((p, i) => ({ url: p.url, order: p.order != null ? p.order : i }))
			.sort((a, b) => a.order - b.order)
			.map((p) => p.url);
	}

	getSourcePreferences() {
		return [
			{
				key: "overrideSiteUrl",
				editTextPreference: {
					title: "Override Site URL",
					summary: "https://asurascans.com",
					value: "https://asurascans.com",
					dialogTitle: "Override Site URL",
					dialogMessage: "",
				},
			},
			{
				key: "overrideApiUrl",
				editTextPreference: {
					title: "Override API URL",
					summary: "https://api.asurascans.com",
					value: "https://api.asurascans.com",
					dialogTitle: "Override API URL",
					dialogMessage: "",
				},
			},
		];
	}
}
