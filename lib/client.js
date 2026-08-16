/**
 * dsh-prompt-dots — client face (browser bundle).
 *
 * Adds a vertical rail of white dots on the right side of every conversation:
 * one dot per user prompt input. Hovering a dot shows a preview tooltip of
 * that prompt; clicking a dot scrolls the chat to the matching message and
 * flashes it briefly.
 *
 * Data comes from the session framework kit (useSession -> ConversationSnapshot:
 * chat.order + chat.nodes, kinds "user"/"steering"). The jump targets the
 * product's own message anchors (div[data-chat-anchor-key]).
 */
window.__ModuleLoader__.load({
	id: "dsh-prompt-dots",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		var react = require("react");
		var createElement = react.createElement;
		var Fragment = react.Fragment;
		var useState = react.useState;
		var useEffect = react.useEffect;
		var useMemo = react.useMemo;

		const name = "prompt-dots";
		const inject = ["slots", "locale"];
		const NS = "prompt-dots";

		const zh = {
			promptLabel: "Prompt #{n}",
			steeringTag: "steering",
			emptyText: "（空输入）",
			imagesText: "🖼 ×{n}",
			railHint: "点击跳转到该条 Prompt"
		};
		const en = {
			promptLabel: "Prompt #{n}",
			steeringTag: "steering",
			emptyText: "(empty input)",
			imagesText: "🖼 ×{n}",
			railHint: "Click to jump to this prompt"
		};

		// ── helpers ──────────────────────────────────────────────────────────

		function fmt(template, n) {
			return String(template ?? "").replaceAll("{n}", String(n));
		}

		/** Extract plain text + image count from a user message content block list. */
		function extract(content) {
			if (typeof content === "string") return { text: content, images: 0 };
			if (!Array.isArray(content)) return { text: "", images: 0 };
			let text = "";
			let images = 0;
			for (const block of content) {
				if (block && block.type === "text" && typeof block.text === "string") text += block.text;
				else if (block && block.type === "image") images += 1;
			}
			return { text, images };
		}

		function cssEscape(value) {
			if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(String(value));
			return String(value).replace(/["\\\]]/g, "\\$&");
		}

		function chatRow(key) {
			if (typeof document === "undefined") return null;
			return document.querySelector('[data-chat-anchor-key="' + cssEscape(key) + '"]');
		}

		function anyChatRow() {
			if (typeof document === "undefined") return null;
			return document.querySelector("[data-chat-anchor-key]");
		}

		/** Nearest scroll container of the chat flow (first overflow-y auto/scroll ancestor). */
		function findScrollport() {
			const row = anyChatRow();
			if (row === null) return null;
			let el = row.parentElement;
			while (el !== null && el !== document.documentElement) {
				const style = window.getComputedStyle(el);
				if (/(auto|scroll)/.test(style.overflowY)) return el;
				el = el.parentElement;
			}
			return null;
		}

		/** Scroll to the message row and flash it briefly. */
		function jumpTo(key) {
			if (typeof document === "undefined") return;
			const row = chatRow(key);
			if (row === null) return;
			try {
				row.scrollIntoView({ behavior: "smooth", block: "center" });
			} catch (error) {
				row.scrollIntoView(true);
			}
			const prevOutline = row.style.outline;
			const prevOffset = row.style.outlineOffset;
			const prevRadius = row.style.borderRadius;
			row.style.outline = "2px solid rgba(255,255,255,0.6)";
			row.style.outlineOffset = "6px";
			row.style.borderRadius = "12px";
			window.setTimeout(() => {
				row.style.outline = prevOutline;
				row.style.outlineOffset = prevOffset;
				row.style.borderRadius = prevRadius;
			}, 1600);
		}

		function formatTime(value) {
			if (value === undefined || value === null) return "";
			if (typeof value === "number") {
				const date = new Date(value);
				return isNaN(date.getTime()) ? "" : date.toLocaleTimeString();
			}
			const date = new Date(value);
			if (!isNaN(date.getTime())) return date.toLocaleTimeString();
			return String(value);
		}

		/** Track the chat scrollport's right edge (viewport coords) for rail placement. */
		function useRailGeometry(enabled) {
			const [geo, setGeo] = useState(null);
			useEffect(() => {
				if (!enabled) {
					setGeo(null);
					return;
				}
				let disposed = false;
				const measure = () => {
					if (disposed || typeof document === "undefined" || typeof window === "undefined") return;
					if (anyChatRow() === null) {
						setGeo(null);
						return;
					}
					const sp = findScrollport();
					const right = sp === null ? window.innerWidth : sp.getBoundingClientRect().right;
					setGeo({ right, vw: window.innerWidth, vh: window.innerHeight });
				};
				measure();
				const timer = window.setInterval(measure, 700);
				window.addEventListener("resize", measure);
				return () => {
					disposed = true;
					window.clearInterval(timer);
					window.removeEventListener("resize", measure);
				};
			}, [enabled]);
			return geo;
		}

		// ── rail UI ──────────────────────────────────────────────────────────

		const DOT = 7;
		const GAP = 11;
		const MAX_TEXT = 800;
		const TIP_MAX_W = 360;

		function clamp(value, min, max) {
			return Math.max(min, Math.min(max, value));
		}

		function PromptDotsRail({ useSession, t }) {
			const chat = useSession((s) => s && s.chat);
			const prompts = useMemo(() => {
				const list = [];
				if (chat && Array.isArray(chat.order) && chat.nodes) {
					for (const key of chat.order) {
						const node = chat.nodes.get(key);
						if (node === undefined) continue;
						if (node.kind !== "user" && node.kind !== "steering") continue;
						if (node.visibility === "hidden") continue;
						const content = extract(node.data ? node.data.content : undefined);
						list.push({
							key: String(node.key),
							kind: node.kind,
							text: content.text,
							images: content.images,
							time: node.data ? node.data.time : undefined
						});
					}
				}
				return list;
			}, [chat]);

			const [hover, setHover] = useState(null);
			const geo = useRailGeometry(prompts.length > 0);

			if (prompts.length === 0 || geo === null) return null;

			const tr = (key) => (typeof t === "function" ? t(key) : zh[key]);
			const total = prompts.length * DOT + (prompts.length - 1) * GAP;
			const railTop = clamp(geo.vh / 2 - total / 2, 8, Math.max(8, geo.vh - total - 8));
			const railLeft = Math.max(8, geo.right - 14 - DOT);

			const hovered = hover !== null ? prompts[hover] : null;
			const dotStyle = (index) => {
				const active = hover === index;
				return {
					width: DOT,
					height: DOT,
					borderRadius: "50%",
					background: "rgba(255,255,255," + (active ? "1" : "0.55") + ")",
					border: "1px solid rgba(0,0,0,0.28)",
					boxShadow: active ? "0 0 8px rgba(255,255,255,0.85)" : "none",
					cursor: "pointer",
					transform: active ? "scale(1.45)" : "scale(1)",
					transition: "transform 120ms ease, background 120ms ease, box-shadow 120ms ease",
					flex: "none"
				};
			};

			const tooltip = hovered === null ? null : (() => {
				const index = hover;
				const dotCenterY = railTop + index * (DOT + GAP) + DOT / 2;
				const tipW = Math.min(TIP_MAX_W, Math.max(220, geo.vw - 32));
				const tipLeft = Math.max(8, geo.right - 14 - DOT - 12 - tipW);
				const tipTop = clamp(dotCenterY - 60, 8, Math.max(8, geo.vh - 240));
				const text = hovered.text.trim();
				const shown = (text.length > 0 ? text : tr("emptyText")) + (hovered.images > 0 ? (text.length > 0 ? "\n" : "") + fmt(tr("imagesText"), hovered.images) : "");
				const header = fmt(tr("promptLabel"), index + 1) + " / " + prompts.length
					+ (hovered.kind === "steering" ? " · " + tr("steeringTag") : "")
					+ (hovered.time !== undefined ? " · " + formatTime(hovered.time) : "");
				return createElement("div", {
					style: {
						position: "fixed",
						top: tipTop,
						left: tipLeft,
						width: tipW,
						maxHeight: 232,
						overflow: "hidden",
						zIndex: 501,
						background: "var(--dsw-alias-bg-base)",
						border: "1px solid var(--dsw-alias-border-l1)",
						borderRadius: 10,
						padding: "10px 12px",
						boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
						pointerEvents: "none",
						color: "var(--dsw-alias-label-primary)",
						fontSize: 12,
						lineHeight: 1.55
					}
				},
					createElement("div", {
						style: {
							fontWeight: 600,
							fontSize: 12,
							marginBottom: 5,
							color: "var(--dsw-alias-label-secondary)",
							borderBottom: "1px solid var(--dsw-alias-border-l1)",
							paddingBottom: 5
						}
					}, header),
					createElement("div", {
						style: {
							whiteSpace: "pre-wrap",
							wordBreak: "break-word",
							overflow: "hidden"
						}
					}, shown.length > MAX_TEXT ? shown.slice(0, MAX_TEXT) + "…" : shown)
				);
			})();

			return createElement(Fragment, null,
				createElement("div", {
					"data-prompt-dots-rail": "true",
					role: "navigation",
					"aria-label": tr("railHint"),
					style: {
						position: "fixed",
						top: railTop,
						left: railLeft,
						width: DOT,
						zIndex: 500,
						display: "flex",
						flexDirection: "column",
						alignItems: "center",
						gap: GAP,
						userSelect: "none"
					}
				},
					prompts.map((prompt, index) => createElement("div", {
						key: prompt.key,
						"data-prompt-dot": String(index + 1),
						style: dotStyle(index),
						title: undefined,
						onMouseEnter: () => setHover(index),
						onMouseLeave: () => setHover(null),
						onClick: () => jumpTo(prompt.key)
					}))
				),
				tooltip
			);
		}

		// ── cordis plugin ────────────────────────────────────────────────────

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "prompt-dots: dictionaries");
			ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
				name: "conversation.input.dock",
				id: "prompt-dots",
				order: 40,
				locale: NS
			}, PromptDotsRail));
		}

		exports.name = name;
		exports.inject = inject;
		exports.apply = apply;
		return exports;
	}
});
