const mangayomiSources = [
	{
		id: 524070078,
		name: "Asura Scans",
		lang: "en",
		baseUrl: "https://asurascans.com",
		apiUrl: "https://api.asurascans.com",
		iconUrl:
			"https://raw.githubusercontent.com/m2k3a/mangayomi-extensions/main/javascript/icon/en.asurascans.png",
		typeSource: "single",
		itemType: 0,
		version: "0.2.14",
		dateFormat: "",
		dateFormatLocale: "",
		pkgPath: "manga/src/en/asurascans.js",
	},
];

class DefaultExtension extends MProvider {
	constructor(...args) {
		super(...args);
		this._hasSessionAuthCache = null;
		this._accessTokenCache = "";
		this._refreshTokenCache = "";
	}

	_trimTrailingSlash(url) {
		return String(url || "")
			.trim()
			.replace(/\/+$/, "");
	}

	_normalizeSitePath(path, fallback = "/") {
		const raw = String(path || "").trim();
		if (!raw) return fallback;
		if (/^https?:\/\//i.test(raw)) {
			return raw;
		}
		return raw.startsWith("/") ? raw : `/${raw}`;
	}

	_parseJsonBody(body, context) {
		const raw = String(body || "").trim();
		try {
			return JSON.parse(raw);
		} catch (_err) {
			const firstObj = raw.indexOf("{");
			const firstArr = raw.indexOf("[");
			const first =
				firstObj === -1
					? firstArr
					: firstArr === -1
						? firstObj
						: Math.min(firstObj, firstArr);
			const lastObj = raw.lastIndexOf("}");
			const lastArr = raw.lastIndexOf("]");
			const last = Math.max(lastObj, lastArr);

			if (first !== -1 && last !== -1 && last > first) {
				const candidate = raw.slice(first, last + 1);
				try {
					return JSON.parse(candidate);
				} catch (_err2) {}
			}
			throw new Error(`Invalid JSON response in ${context}`);
		}
	}

	_getHeaderValue(headers, targetKey) {
		if (!headers || typeof headers !== "object") return "";
		const normalizedTarget = String(targetKey || "").toLowerCase();
		for (const key of Object.keys(headers)) {
			if (String(key).toLowerCase() !== normalizedTarget) continue;
			const value = headers[key];
			if (Array.isArray(value)) return value.join("; ");
			return value != null ? String(value) : "";
		}
		return "";
	}

	_cacheAuthTokensFromResponse(response) {
		const requestCookieHeader = this._getHeaderValue(
			response?.request?.headers,
			"cookie",
		);
		const responseSetCookieHeader = this._getHeaderValue(
			response?.headers,
			"set-cookie",
		);
		const cookieHeader = requestCookieHeader || responseSetCookieHeader;
		if (!cookieHeader) return;

		let accessToken = "";
		let refreshToken = "";
		for (const part of cookieHeader.split(";")) {
			const idx = part.indexOf("=");
			if (idx <= 0) continue;
			const name = part.slice(0, idx).trim();
			let value = part.slice(idx + 1).trim();
			if (!value) continue;
			try {
				value = decodeURIComponent(value);
			} catch (_err) {}
			if (name === "access_token") accessToken = value;
			if (name === "refresh_token") refreshToken = value;
		}

		if (accessToken && accessToken !== this._accessTokenCache) {
			this._accessTokenCache = accessToken;
			this._hasSessionAuthCache = null;
		}
		if (refreshToken && refreshToken !== this._refreshTokenCache) {
			this._refreshTokenCache = refreshToken;
			this._hasSessionAuthCache = null;
		}
	}

	getHeaders(_url) {
		return { Referer: this.siteBase };
	}

	get apiHeaders() {
		return { Referer: this.siteBase };
	}

	_buildApiHeaders(useAuth = false) {
		const headers = { Referer: this.siteBase };
		if (useAuth && this._accessTokenCache) {
			headers.Authorization = `Bearer ${this._accessTokenCache}`;
		}
		return headers;
	}

	async _apiGet(url, useAuth = false) {
		const res = await new Client({ useDartHttpClient: true }).get(
			url,
			this._buildApiHeaders(useAuth),
		);
		this._cacheAuthTokensFromResponse(res);
		return res;
	}

	async _refreshAccessToken() {
		if (!this._refreshTokenCache) return false;
		try {
			const res = await new Client({ useDartHttpClient: true }).post(
				`${this.apiBase}/api/auth/refresh`,
				{
					...this.apiHeaders,
					"Content-Type": "application/json",
				},
				{ refresh_token: this._refreshTokenCache },
			);
			this._cacheAuthTokensFromResponse(res);
			const json = this._parseJsonBody(res.body, "auth-refresh");
			const data = json.data || json;
			if (data?.access_token)
				this._accessTokenCache = String(data.access_token);
			if (data?.refresh_token)
				this._refreshTokenCache = String(data.refresh_token);
			return !!this._accessTokenCache;
		} catch (_err) {
			return false;
		}
	}

	async _hasSessionAuth() {
		if (this._hasSessionAuthCache != null) return this._hasSessionAuthCache;
		try {
			const res = await this._apiGet(`${this.apiBase}/api/users/me`, true);
			const json = this._parseJsonBody(res.body, "session-auth-probe");
			const user = json.data || json;
			const ok = !!user && !json.error;
			this._hasSessionAuthCache = ok;
			return ok;
		} catch (_err) {
			this._hasSessionAuthCache = false;
			return false;
		}
	}

	get apiBase() {
		return this._trimTrailingSlash(
			new SharedPreferences().get("overrideApiUrl") || this.source.apiUrl,
		);
	}

	get siteBase() {
		return this._trimTrailingSlash(
			new SharedPreferences().get("overrideSiteUrl") || this.source.baseUrl,
		);
	}

	// Supports: "/comics/foo-f6174291", "https://.../comics/foo-f6174291", "/series/foo", "foo"
	_slugFromUrl(url) {
		const raw = String(url || "").trim();
		if (!raw) throw new Error("Missing manga URL");
		if (raw.includes("||")) return raw.split("||")[0];

		let path = raw
			.replace(/^https?:\/\/[^/]+/i, "")
			.split("?")[0]
			.split("#")[0];
		path = path.replace(/^\/+/, "").replace(/\/+$/, "");

		const routeMatch = path.match(/(?:^|\/)(?:comics|series)\/([^/]+)/i);
		if (routeMatch?.[1]) {
			return routeMatch[1].replace(/-f[0-9a-f]{6,8}$/i, "");
		}

		const singleSegment = path.split("/").filter(Boolean);
		if (singleSegment.length === 1) {
			return singleSegment[0].replace(/-f[0-9a-f]{6,8}$/i, "");
		}

		throw new Error(`Unable to parse series slug from URL: ${url}`);
	}

	_chapterRefFromUrl(url) {
		const raw = String(url || "").trim();
		if (!raw) throw new Error("Missing chapter URL");

		if (raw.includes("||")) {
			const [seriesSlug, chapterSlug] = raw.split("||");
			return { seriesSlug, chapterSlug };
		}

		let path = raw
			.replace(/^https?:\/\/[^/]+/i, "")
			.split("?")[0]
			.split("#")[0];
		path = path.replace(/^\/+/, "").replace(/\/+$/, "");
		const parts = path.split("/").filter(Boolean);

		if (
			parts.length >= 3 &&
			(parts[0] === "comics" || parts[0] === "series") &&
			parts[1]
		) {
			return {
				seriesSlug: parts[1].replace(/-f[0-9a-f]{6,8}$/i, ""),
				chapterSlug: parts[parts.length - 1],
			};
		}

		throw new Error(`Unable to parse chapter URL: ${url}`);
	}

	_parseMangaList(json) {
		const items = json.data || [];
		const meta = json.meta || {};
		const list = items.map((item) => ({
			name: item.title || item.name || "",
			imageUrl: item.cover || item.cover_url || "",
			link: this._normalizeSitePath(
				item.public_url || (item.slug ? `/comics/${item.slug}` : ""),
				"/",
			),
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
			case "seasonal":
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
		const res = await this._apiGet(
			`${this.apiBase}/api/series?sort=rating&order=desc&offset=${offset}&limit=20`,
			true,
		);
		return this._parseMangaList(this._parseJsonBody(res.body, "getPopular"));
	}

	async getLatestUpdates(page) {
		const offset = (page - 1) * 20;
		const res = await this._apiGet(
			`${this.apiBase}/api/series?sort=latest&order=desc&offset=${offset}&limit=20`,
			true,
		);
		return this._parseMangaList(
			this._parseJsonBody(res.body, "getLatestUpdates"),
		);
	}

	async search(query, page, filters) {
		const q = encodeURIComponent(query || "");
		const offset = (page - 1) * 20;
		const safeFilters = Array.isArray(filters) ? filters : [];

		const selectValue = (index, fallback) => {
			const filter = safeFilters[index];
			if (!filter || !Array.isArray(filter.values)) return fallback;
			const selected = filter.values[filter.state];
			if (!selected || selected.value == null) return fallback;
			return selected.value;
		};

		const sortBy = selectValue(0, "rating");
		const sortDir = selectValue(1, "desc");
		const status = selectValue(2, "");
		const type = selectValue(3, "");
		const genreFilter = safeFilters[4];
		const genres = Array.isArray(genreFilter?.state)
			? genreFilter.state
					.filter((cb) => cb.state)
					.map((cb) => cb.value)
					.join(",")
			: "";

		let url = `${this.apiBase}/api/series?offset=${offset}&limit=20&sort=${sortBy}&order=${sortDir}`;
		if (q) url += `&search=${q}`;
		if (status) url += `&status=${status}`;
		if (type) url += `&type=${type}`;
		if (genres) url += `&genres=${encodeURIComponent(genres)}`;

		const res = await this._apiGet(url, true);
		return this._parseMangaList(this._parseJsonBody(res.body, "search"));
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
					{
						type_name: "SelectOption",
						name: "Seasonal",
						value: "seasonal",
					},
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

		const seriesRes = await this._apiGet(
			`${this.apiBase}/api/series/${slug}`,
			true,
		);
		const seriesJson = this._parseJsonBody(seriesRes.body, "getDetail-series");
		const s = seriesJson.series || seriesJson;

		const description = (s.description || "").replace(/<[^>]+>/g, "").trim(); // HTML strip
		const imageUrl = s.cover || s.cover_url || "";
		const seriesPublicUrl = this._normalizeSitePath(
			s.public_url || `/comics/${slug}`,
			`/comics/${slug}`,
		);
		const author = s.author || "";
		const artist = s.artist || "";
		const status = this.toStatus(s.status);
		const genre = (s.genres || []).map((g) => g.name);

		// Paginate chapters by offset (the API does not reliably advance by page).
		const allChaps = [];
		const seenChapterKeys = new Set();
		let offset = 0;
		const limit = 100;
		while (true) {
			const chapRes = await this._apiGet(
				`${this.apiBase}/api/series/${slug}/chapters?offset=${offset}&limit=${limit}`,
				true,
			);
			const pageJson = this._parseJsonBody(
				chapRes.body,
				`getDetail-chapters-offset-${offset}`,
			);
			const pageData = pageJson.data || [];
			if (pageData.length === 0) break;

			let newCount = 0;
			for (const ch of pageData) {
				const key = ch.id != null ? String(ch.id) : String(ch.slug || "");
				if (!key || seenChapterKeys.has(key)) continue;
				seenChapterKeys.add(key);
				allChaps.push(ch);
				newCount++;
			}

			if (pageData.length < limit || newCount === 0) break;
			offset += limit;
		}

		// chapter url is a web path so WebView can open it directly
		const chapters = allChaps.map((ch) => {
			const chapterLabel =
				ch.number != null ? `Chapter ${ch.number}` : "Chapter";
			const chapterTitle = (ch.title || "").trim();
			return {
				name: chapterTitle ? `${chapterLabel} - ${chapterTitle}` : chapterLabel,
				url: `${seriesPublicUrl}/chapter/${ch.slug}`,
				dateUpload: this.parseDate(ch.published_at),
			};
		});

		return { imageUrl, description, genre, author, artist, status, chapters };
	}

	async getPageList(url) {
		const { seriesSlug, chapterSlug } = this._chapterRefFromUrl(url);
		const endpoint = `${this.apiBase}/api/series/${seriesSlug}/chapters/${chapterSlug}`;

		const parsePageList = (pages) => {
			const sourcePages = Array.isArray(pages) ? pages : [];
			return sourcePages
				.map((p, i) =>
					typeof p === "string"
						? { url: p, order: i }
						: {
								url:
									p.url || p.image_url || p.page_url || p.image || p.src || "",
								order:
									p.order != null ? p.order : p.index != null ? p.index : i,
							},
				)
				.filter((p) => !!p.url)
				.sort((a, b) => a.order - b.order)
				.map((p) => p.url);
		};

		const fetchChapter = async (context) => {
			const res = await this._apiGet(endpoint, true);
			const json = this._parseJsonBody(res.body, context);
			const chapter = json.data?.chapter || json.chapter || json.data || json;
			const pages = chapter?.pages || json.data?.pages || json.pages || [];
			const isLocked =
				chapter?.is_locked ?? json.data?.is_locked ?? json.is_locked ?? false;
			return { pages, isLocked };
		};

		let chapterData = await fetchChapter("getPageList-initial");
		let pageList = parsePageList(chapterData.pages);

		// First request may have only cookie auth; retry with bearer if token was discovered.
		if (
			pageList.length === 0 &&
			chapterData.isLocked &&
			this._accessTokenCache
		) {
			chapterData = await fetchChapter("getPageList-bearer-retry");
			pageList = parsePageList(chapterData.pages);
		}

		// If bearer token expired, refresh and retry once.
		if (
			pageList.length === 0 &&
			chapterData.isLocked &&
			this._refreshTokenCache
		) {
			const refreshed = await this._refreshAccessToken();
			if (refreshed) {
				chapterData = await fetchChapter("getPageList-refresh-retry");
				pageList = parsePageList(chapterData.pages);
			}
		}

		if (pageList.length > 0) return pageList;

		const hasSessionAuth = await this._hasSessionAuth();
		if (!hasSessionAuth) {
			throw new Error(
				"Chapter appears locked. Login via source WebView, then retry.",
			);
		}
		if (chapterData.isLocked) {
			throw new Error("Chapter is locked (premium required on Asura Scans).");
		}
		throw new Error("No readable pages found for this chapter");
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
