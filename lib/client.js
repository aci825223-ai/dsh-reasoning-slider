/**
 * dsh-reasoning-slider — browser half.
 *
 * Served verbatim by the client-modules host half; the wrapper below is the
 * hand-authored bundle contract used by external DSH plugins (no build step).
 *
 * What it does: registers a competing occupant for the single slot
 * `conversation.input.model` at priority -1. Single slots render their lowest
 * priority occupant, so this shadows the shipped `ModelSelect` while leaving
 * `ui-model-selection` (and therefore the `modelDirectories` service, the
 * catalog loading and the /model popup) untouched.
 *
 * The replacement keeps the shipped trigger look and the model drill-down, but
 * renders the reasoning effort as a real slider with discrete stops.
 *
 * @module dsh-reasoning-slider/client
 */
window.__ModuleLoader__.load({
	id: `dsh-reasoning-slider`,
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		const React = require("react");
		const ReactDOM = require("react-dom");
		const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		const h = React.createElement;

		/** Plugin id; also the loader id of this bundle. */
		const ID = `dsh-reasoning-slider`;
		/** Locale namespace owned by this plugin. */
		const NS = `reasoning-slider`;
		/** The composer cell this plugin occupies. */
		const SLOT = `conversation.input.model`;
		/** Lower than the shipped occupant's default 0, so this one renders. */
		const SHADOW_PRIORITY = -1;

		/** zh dictionary. */
		const ZH = {
			model: `模型`,
			effort: `推理等级`,
			providerDefault: `默认`,
			selectModel: `选择模型`,
			searchPlaceholder: `搜索模型…`,
			searchClear: `清除`,
			searchEmpty: `未找到匹配的模型`,
			loading: `加载中…`,
			selecting: `正在切换…`,
			emptyModels: `没有可用的模型。`,
			emptyEfforts: `当前模型未提供推理等级。`,
			errorSessionInUse: `当前会话正在写入，暂时无法切换模型。`,
			retry: `重试`,
			back: `返回`,
			groupFailed: `分组加载失败`,
			sliderAria: `推理等级滑块`,
			resetEffort: `恢复默认推理等级`,
			sliderValue: `第 {n} 级 / 共 {total} 级`,
			dragHint: `拖动或按方向键调整推理等级`,
			triggerAria: `模型 {model}，推理等级 {effort}`,
			menuAria: `模型与推理等级`,
		};

		/** en dictionary. */
		const EN = {
			model: `Model`,
			effort: `Effort`,
			providerDefault: `Default`,
			selectModel: `Select model`,
			searchPlaceholder: `Search models…`,
			searchClear: `Clear`,
			searchEmpty: `No matching model`,
			loading: `Loading…`,
			selecting: `Switching…`,
			emptyModels: `No models are available.`,
			emptyEfforts: `This model provides no reasoning effort.`,
			errorSessionInUse: `This session is being written to right now — try again in a moment.`,
			retry: `Retry`,
			back: `Back`,
			groupFailed: `Group failed to load`,
			sliderAria: `Reasoning effort slider`,
			resetEffort: `Reset to the default reasoning effort`,
			sliderValue: `Level {n} of {total}`,
			dragHint: `Drag or use the arrow keys to change reasoning effort`,
			triggerAria: `Model {model}, reasoning effort {effort}`,
			menuAria: `Model and reasoning effort`,
		};

		/**
		 * Substitute `{name}` placeholders.
		 * @param template - the dictionary string.
		 * @param params - placeholder values.
		 * @returns the rendered string.
		 */
		function format(template, params) {
			if (typeof template !== `string`) return ``;
			if (params === undefined || params === null) return template;
			return template.replace(/\{(\w+)\}/g, (match, key) =>
				params[key] === undefined ? match : String(params[key]));
		}

		/**
		 * Pick a dictionary language from the document, then the browser.
		 * @returns `zh` or `en`.
		 */
		function language() {
			const root = typeof document === `undefined` ? null : document.documentElement;
			const declared = (root && root.getAttribute(`lang`)) || ``;
			const nav = typeof navigator === `undefined` ? `` : navigator.language || ``;
			return /^zh/i.test(declared || nav) ? `zh` : `en`;
		}

		/**
		 * Fallback translator used when the slot does not hand us a `t`.
		 * @returns a `(key, params) => string` translator.
		 */
		function fallbackTranslator() {
			return (key, params) => {
				const dict = language() === `zh` ? ZH : EN;
				return format(dict[key] === undefined ? key : dict[key], params);
			};
		}

		/**
		 * Bind the slot-provided translator, falling back to the local
		 * dictionary when the official namespace is unavailable.
		 * @param provided - `props.t` from the slot registration.
		 * @returns a translator.
		 */
		function useTranslator(provided) {
			const fallback = React.useMemo(fallbackTranslator, []);
			return React.useMemo(() => {
				if (typeof provided !== `function`) return fallback;
				return (key, params) => {
					const value = provided(key, params);
					if (value === undefined || value === null || value === key) {
						const dict = language() === `zh` ? ZH : EN;
						if (dict[key] !== undefined) return format(dict[key], params);
					}
					return value;
				};
			}, [provided, fallback]);
		}

		/* ------------------------------------------------------------------ *
		 * data helpers
		 * ------------------------------------------------------------------ */

		/**
		 * Rank a provider: the DeepSeek account first, then other DeepSeek
		 * providers, then everything else — same intent as the shipped menu.
		 * @param id - provider id.
		 * @returns the sort rank.
		 */
		function providerRank(id) {
			const value = String(id === undefined ? `` : id);
			if (value === `deepseek-account`) return 0;
			if (value.indexOf(`deepseek`) === 0) return 1;
			return 2;
		}

		/**
		 * Stable provider ordering.
		 * @param groups - catalog groups.
		 * @returns the ordered groups.
		 */
		function orderGroups(groups) {
			return groups
				.map((group, index) => ({ group, index }))
				.sort((a, b) =>
					providerRank(a.group.id) - providerRank(b.group.id) || a.index - b.index)
				.map((entry) => entry.group);
		}

		/**
		 * Fuzzy-ish model filter, matching names first and ids second.
		 * @param models - candidate models.
		 * @param query - the raw search box value.
		 * @returns the ranked models.
		 */
		function rankModels(models, query) {
			const needle = String(query === undefined ? `` : query).trim().toLowerCase();
			if (needle === ``) return models;
			const scored = [];
			models.forEach((model, index) => {
				const name = String(model.name === undefined ? model.id : model.name).toLowerCase();
				const id = String(model.id).toLowerCase();
				let score = -1;
				if (name === needle) score = 0;
				else if (name.indexOf(needle) === 0) score = 1;
				else if (name.indexOf(needle) > 0) score = 2;
				else if (id.indexOf(needle) >= 0) score = 3;
				if (score >= 0) scored.push({ model, score, index });
			});
			scored.sort((a, b) => a.score - b.score || a.index - b.index);
			return scored.map((entry) => entry.model);
		}

		/**
		 * Build a `ModelSelection` for one model, optionally forcing an effort.
		 * @param group - the owning provider group.
		 * @param model - the catalog model.
		 * @param effort - reasoning effort id, or `undefined` for the provider default.
		 * @returns the selection object.
		 */
		function selectionFor(group, model, effort) {
			const selection = { provider: group.id, model: model.id };
			if (effort !== undefined && effort !== null) selection.reasoningEffort = effort;
			return selection;
		}

		/**
		 * Clamp a number.
		 * @param value - the input.
		 * @param min - lower bound.
		 * @param max - upper bound.
		 * @returns the clamped value.
		 */
		function clamp(value, min, max) {
			return value < min ? min : value > max ? max : value;
		}

		/**
		 * Position of stop `index` as a percentage of the rail.
		 * @param index - stop index.
		 * @param total - stop count.
		 * @returns a CSS percentage such as `50%`.
		 */
		function stopPercent(index, total) {
			if (total <= 1) return `0%`;
			return `${String((index / (total - 1)) * 100)}%`;
		}

		/* ------------------------------------------------------------------ *
		 * styles
		 * ------------------------------------------------------------------ */

		/**
		 * Inject this plugin's stylesheet once.
		 * @returns nothing.
		 */
		function installStyles() {
			const key = `${ID}/ReasoningSlider.css`;
			if (document.querySelector(`style[data-plugin-css="${key}"]`) !== null) return;
			const style = document.createElement(`style`);
			style.setAttribute(`data-plugin-css`, key);
			style.textContent = CSS;
			document.head.append(style);
		}

		/** The plugin stylesheet; class names are prefixed `rs-`. */
		const CSS = `
.rs-root{min-width:0;position:relative}
.rs-trigger{border-radius:var(--dsw-radius-sm);min-width:0;max-width:min(360px,45cqw);height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;outline:none;align-items:center;gap:5px;padding:0 4px 0 8px;font-size:13px;font-weight:400;line-height:20px;display:flex}
.rs-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.rs-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}
.rs-trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.rs-triggerIcon{display:var(--dsh-composer-model-icon-display,none);flex:none}
.rs-triggerLabel{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden;display:var(--dsh-composer-model-text-display,block)}
.rs-triggerEffort{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-caption);flex-shrink:1000;overflow:hidden;display:var(--dsh-composer-model-text-display,block)}
.rs-chevron{color:var(--dsw-alias-label-caption);flex:none;transition:transform .12s}
.rs-chevronOpen{transform:rotate(180deg)}
.rs-mini{flex:none;width:30px;height:6px;display:var(--dsh-composer-model-text-display,block)}
.rs-miniRow{align-items:center;gap:2px;height:100%;display:flex}
.rs-miniSeg{flex:1;height:4px;border-radius:2px;background:var(--dsw-alias-label-caption);opacity:.35}
.rs-miniSegOn{opacity:1;background:var(--dsw-alias-state-business-primary)}
.rs-menu{z-index:1100;--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);width:max-content;min-width:min(288px,100vw - 32px);max-width:min(300px,100vw - 32px);max-height:min(360px,100vh - 96px);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary);border:0;flex-direction:column;padding:4px;display:flex;position:fixed;overflow:hidden}
.rs-menuCard{padding:0}
.rs-status,.rs-empty{color:var(--dsw-alias-label-tertiary);padding:8px;font-size:12px;line-height:18px}
.rs-error,.rs-warning{border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:3px;padding:6px 7px;font-size:11px;line-height:16px;display:flex}
.rs-warning{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-state-warn-label)}
.rs-retry{color:inherit;font:inherit;cursor:pointer;background:0 0;border:none;flex:none;padding:0;font-weight:600}
.rs-cell{box-sizing:border-box;border-radius:var(--dsw-radius-md);width:auto;min-width:100%;height:34px;color:var(--dsw-alias-label-primary);cursor:pointer;text-align:left;background:0 0;border:none;align-items:center;gap:6px;padding:0 8px;font-size:13px;line-height:20px;display:flex}
.rs-cell:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.rs-cellLabel{flex:none}
.rs-cellValue{text-overflow:ellipsis;text-align:right;min-width:0;color:var(--dsw-alias-label-tertiary);flex:auto;white-space:nowrap;overflow:hidden}
.rs-cellChevron{color:var(--dsw-alias-label-caption);flex:none}
.rs-back{color:var(--dsw-alias-label-caption);flex:none}
.rs-card{border-radius:inherit;background:var(--dsw-alias-bg-layer-2);padding:10px 14px 12px}
.rs-head{align-items:center;gap:8px;min-height:26px;display:flex}
.rs-bolt{color:var(--dsw-alias-state-business-primary);flex:none;display:flex}
.rs-value{text-align:center;text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-state-business-primary);flex:auto;font-size:15px;font-weight:600;line-height:22px;overflow:hidden}
.rs-reset{border-radius:6px;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;flex:none;padding:3px;display:flex}
.rs-reset:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.rs-reset:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.rs-sub{border-radius:6px;width:100%;color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;justify-content:center;align-items:center;gap:2px;margin-top:1px;padding:1px 4px;font-size:12px;line-height:18px;display:flex}
.rs-sub:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}
.rs-subName{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}
.rs-slider{position:relative;height:26px;margin-top:10px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent);cursor:pointer;outline:none;touch-action:none}
.rs-slider:focus-visible{box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}
.rs-slider.is-disabled{cursor:default;opacity:.6}
.rs-fill{position:absolute;left:0;top:0;bottom:0;border-radius:999px;background:var(--dsw-alias-state-business-primary);transition:width .1s linear}
.rs-dot{position:absolute;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;background:var(--dsw-alias-label-caption);opacity:.85}
.rs-dotOn{background:#ffffff8c;opacity:1}
.rs-thumb{position:absolute;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:#fff;box-shadow:0 1px 4px #00000059,0 0 0 1px #00000012;transition:left .1s linear}
.rs-searchRow{flex-shrink:0;margin:2px 0 3px;position:relative}
.rs-searchRow .rs-search{border-radius:var(--dsw-radius-md);background:0 0;border:0 solid #0000;height:auto;padding:5px 7px;display:flex}
.rs-searchRow .rs-searchWithQuery{padding-right:28px}
.rs-searchClear{position:absolute;top:50%;right:8px;transform:translateY(-50%);color:var(--dsw-alias-label-caption);cursor:pointer;background:0 0;border:none;padding:0;display:flex}
.rs-groupLabel{color:var(--dsw-alias-label-tertiary);flex-shrink:0;gap:6px;align-items:center;padding:5px 8px 3px;font-size:11px;line-height:16px;display:flex}
.rs-groupFailure{color:var(--dsw-alias-state-error-primary);padding:4px 8px;font-size:11px;line-height:16px}
.rs-list{flex-direction:column;min-height:0;display:flex;overflow-y:auto;scrollbar-width:thin}
.rs-option{border-radius:var(--dsw-radius-md);min-width:100%;min-height:34px;color:var(--dsw-alias-label-primary);cursor:pointer;text-align:left;background:0 0;border:none;align-items:center;gap:6px;padding:5px 7px;display:flex}
.rs-option:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.rs-option:disabled{cursor:default}
.rs-optionCopy{flex-direction:column;flex:auto;min-width:0;display:flex}
.rs-modelName{text-overflow:ellipsis;font-size:13px;line-height:18px;white-space:nowrap;overflow:hidden}
.rs-check{color:var(--dsw-alias-label-positive);flex:none}
`;

		/* ------------------------------------------------------------------ *
		 * components
		 * ------------------------------------------------------------------ */

		/**
		 * The compact level meter shown inside the composer trigger.
		 * @param props.stops - slider stops.
		 * @param props.index - active stop index.
		 * @returns the meter element.
		 */
		function MiniTrack({ stops, index }) {
			const total = stops.length;
			const segments = [];
			for (let i = 0; i < total; i += 1) {
				segments.push(h(`span`, {
					key: `s${String(i)}`,
					className: i <= index ? `rs-miniSeg rs-miniSegOn` : `rs-miniSeg`,
				}));
			}
			return h(`span`, { className: `rs-mini`, 'aria-hidden': `true` },
				h(`span`, { className: `rs-miniRow` }, segments));
		}

		/**
		 * The filled lightning glyph shown at the head of the effort card.
		 * @returns the bolt element.
		 */
		function Bolt() {
			return h(`span`, { className: `rs-bolt`, 'aria-hidden': `true` }, h(`svg`, {
				width: 18,
				height: 18,
				viewBox: `0 0 24 24`,
				fill: `currentColor`,
				focusable: `false`,
			}, h(`path`, {
				d: `M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21z`,
			})));
		}

		/**
		 * The draggable, keyboard-operable effort slider.
		 * @param props.stops - `{ id, name, description }` stops, in catalog order.
		 * @param props.index - active stop index.
		 * @param props.disabled - whether interaction is suspended.
		 * @param props.t - the translator.
		 * @param props.onPreview - called with a stop index while dragging.
		 * @param props.onCommit - called with the chosen stop index.
		 * @returns the slider element.
		 */
		function EffortSlider({ stops, index, disabled, t, onPreview, onCommit }) {
			const railRef = React.useRef(null);
			const total = stops.length;
			const active = index;

			/**
			 * Map a viewport x coordinate onto the nearest stop.
			 * @param clientX - pointer x.
			 * @returns the stop index.
			 */
			const stopAt = (clientX) => {
				const element = railRef.current;
				if (element === null || total <= 1) return 0;
				const rect = element.getBoundingClientRect();
				if (rect.width <= 0) return 0;
				const ratio = (clientX - rect.left) / rect.width;
				return clamp(Math.round(ratio * (total - 1)), 0, total - 1);
			};

			/**
			 * Begin a drag; commits on release.
			 * @param event - the pointer down event.
			 * @returns nothing.
			 */
			const startDrag = (event) => {
				if (disabled || total <= 1) return;
				if (event.button !== undefined && event.button !== 0) return;
				// Focus explicitly: `preventDefault` below suppresses the native
				// focus-on-pointerdown, which would strand keyboard users.
				if (railRef.current !== null) railRef.current.focus();
				event.preventDefault();
				event.stopPropagation();
				onPreview(stopAt(event.clientX));
				const style = document.body.style;
				const previous = style.cursor;
				style.cursor = `grabbing`;
				const move = (moveEvent) => { onPreview(stopAt(moveEvent.clientX)); };
				const finish = (upEvent) => {
					window.removeEventListener(`pointermove`, move);
					window.removeEventListener(`pointerup`, finish);
					window.removeEventListener(`pointercancel`, finish);
					style.cursor = previous;
					onCommit(stopAt(upEvent.clientX));
				};
				window.addEventListener(`pointermove`, move);
				window.addEventListener(`pointerup`, finish);
				window.addEventListener(`pointercancel`, finish);
			};

			/**
			 * Arrow keys move one stop and commit immediately.
			 * @param event - the key event.
			 * @returns nothing.
			 */
			const onKeyDown = (event) => {
				if (disabled || total <= 1) return;
				let next = active < 0 ? 0 : active;
				if (event.key === `ArrowRight` || event.key === `ArrowUp`) next = clamp(next + 1, 0, total - 1);
				else if (event.key === `ArrowLeft` || event.key === `ArrowDown`) next = clamp(next - 1, 0, total - 1);
				else if (event.key === `Home`) next = 0;
				else if (event.key === `End`) next = total - 1;
				else return;
				event.preventDefault();
				event.stopPropagation();
				onPreview(next);
				onCommit(next);
			};

			const shown = active < 0 ? 0 : Math.min(active, total - 1);
			const track = stopPercent(shown, total);
			const marks = [];
			// Only the stops still ahead of the thumb stay visible; the ones the
			// fill already covers would be invisible, and the thumb hides its own.
			for (let i = shown + 1; i < total; i += 1) {
				marks.push(h(`span`, {
					key: `d${String(i)}`,
					className: `rs-dot`,
					style: { left: stopPercent(i, total) },
				}));
			}

			return h(`div`, {
				ref: railRef,
				className: disabled ? `rs-slider is-disabled` : `rs-slider`,
				role: `slider`,
				tabIndex: disabled ? -1 : 0,
				'aria-label': t(`sliderAria`),
				'aria-orientation': `horizontal`,
				'aria-valuemin': 1,
				'aria-valuemax': total,
				'aria-valuenow': shown + 1,
				'aria-valuetext': stops[shown] === undefined ? `` : stops[shown].name,
				'aria-disabled': disabled ? `true` : undefined,
				title: t(`dragHint`),
				onKeyDown,
				onPointerDown: startDrag,
			}, [
				h(`span`, { key: `fill`, className: `rs-fill`, style: { width: track } }),
				...marks,
				h(`span`, { key: `thumb`, className: `rs-thumb`, style: { left: track } }),
			]);
		}

		/**
		 * The shadowing occupant of `conversation.input.model`.
		 * @param props.locked - the composer owner's lock flag.
		 * @param props.available - whether this session may change models.
		 * @param props.directory - the model directory snapshot store.
		 * @param props.load - loads/refreshes the catalog.
		 * @param props.select - applies a selection.
		 * @param props.t - the translator bound to our namespace.
		 * @returns the composer control.
		 */
		function ReasoningSlider(props) {
			const { available, directory, locked } = props;
			const t = useTranslator(props.t);
			const state = React.useSyncExternalStore(
				(subscribe) => directory.subscribe(subscribe),
				() => directory.getSnapshot());
			const triggerRef = React.useRef(null);
			const menuRef = React.useRef(null);
			const [open, setOpen] = React.useState(false);
			const [pane, setPane] = React.useState(`root`);
			const [query, setQuery] = React.useState(``);
			const [preview, setPreview] = React.useState(null);

			const loadRef = React.useRef(props.load);
			const selectRef = React.useRef(props.select);
			loadRef.current = props.load;
			selectRef.current = props.select;

			React.useEffect(() => {
				if (available && loadRef.current) loadRef.current();
			}, [available]);

			React.useEffect(() => {
				if (!open) {
					setPane(`root`);
					setQuery(``);
					setPreview(null);
					return;
				}
				if (available && loadRef.current) loadRef.current();
			}, [open, available]);

			/**
			 * Return focus to the trigger without the focus ring.
			 * @returns nothing.
			 */
			const restoreFocus = () => {
				queueMicrotask(() => {
					const trigger = triggerRef.current;
					if (trigger !== null) trigger.focus();
				});
			};

			React.useEffect(() => {
				if (!open) return undefined;
				const onPointerDown = (event) => {
					const menu = menuRef.current;
					const trigger = triggerRef.current;
					if (menu !== null && menu.contains(event.target)) return;
					if (trigger !== null && trigger.contains(event.target)) return;
					setOpen(false);
				};
				const onKeyDown = (event) => {
					if (event.key !== `Escape`) return;
					event.preventDefault();
					event.stopPropagation();
					setOpen(false);
					restoreFocus();
				};
				document.addEventListener(`pointerdown`, onPointerDown, true);
				document.addEventListener(`keydown`, onKeyDown, true);
				return () => {
					document.removeEventListener(`pointerdown`, onPointerDown, true);
					document.removeEventListener(`keydown`, onKeyDown, true);
				};
			}, [open]);

			const position = primitives.useAnchoredPosition({
				open,
				anchorRef: triggerRef,
				panelRef: menuRef,
				side: `top`,
				align: `end`,
				gap: 8,
				margin: 12,
			});

			const groups = state.groups === undefined ? [] : state.groups;
			const current = state.current === null || state.current === undefined ? null : state.current;
			const busy = state.pending !== null && state.pending !== undefined;
			const lockedOut = locked === true || available === false;

			const choices = React.useMemo(() => {
				const out = [];
				for (const group of orderGroups(groups)) {
					for (const model of group.models) {
						const effort = model.reasoning === undefined ? undefined : model.reasoning.defaultEffort;
						out.push({ group, model, selection: selectionFor(group, model, effort) });
					}
				}
				return out;
			}, [groups]);

			const currentChoice = choices.find((choice) =>
				current !== null
				&& choice.selection.provider === current.provider
				&& choice.selection.model === current.model);

			const reasoning = currentChoice === undefined ? undefined : currentChoice.model.reasoning;
			const effectiveEffort = current !== null && current.reasoningEffort !== undefined
				? current.reasoningEffort
				: reasoning === undefined ? undefined : reasoning.defaultEffort;

			const stops = React.useMemo(() => {
				if (reasoning === undefined) return [];
				const list = [];
				if (reasoning.defaultEffort === undefined) {
					list.push({ id: undefined, name: t(`providerDefault`), description: undefined });
				}
				for (const level of reasoning.efforts) {
					list.push({ id: level.id, name: level.name, description: level.description });
				}
				return list;
			}, [reasoning, t]);

			let baseIndex = -1;
			for (let i = 0; i < stops.length; i += 1) {
				if (stops[i].id === effectiveEffort) { baseIndex = i; break; }
			}

			const shownIndex = preview === null ? baseIndex : preview;
			const shownStop = shownIndex < 0 ? undefined : stops[shownIndex];

			const effortLabel = reasoning === undefined
				? state.retainedEffort === undefined ? `` : state.retainedEffort
				: shownStop !== undefined
					? shownStop.name
					: effectiveEffort === undefined
						? t(`providerDefault`)
						: (reasoning.efforts.find((level) => level.id === effectiveEffort) || {}).name || effectiveEffort;

			const modelLabel = currentChoice !== undefined
				? currentChoice.model.name
				: current === null ? t(`selectModel`) : current.model;

			/**
			 * Apply a stop.
			 * @param index - the stop index to commit.
			 * @returns nothing.
			 */
			const commitStop = (index) => {
				const stop = stops[index];
				if (stop === undefined || currentChoice === undefined) return;
				if (busy || lockedOut) return;
				setPreview(null);
				if (stop.id === effectiveEffort) return;
				const run = selectRef.current;
				if (typeof run !== `function`) return;
				const result = run(selectionFor(currentChoice.group, currentChoice.model, stop.id));
				if (result !== undefined && result !== null && typeof result.catch === `function`) {
					result.catch(() => {});
				}
			};

			/**
			 * Apply a catalog model.
			 * @param choice - the chosen choice entry.
			 * @returns nothing.
			 */
			const commitModel = (choice) => {
				if (busy || lockedOut) return;
				setPreview(null);
				const run = selectRef.current;
				if (typeof run !== `function`) return;
				const result = run(choice.selection);
				if (result !== undefined && result !== null && typeof result.then === `function`) {
					result.then((outcome) => {
						if (outcome === undefined || outcome === null || outcome.ok !== false) setOpen(false);
					}, () => {});
				} else {
					setOpen(false);
				}
			};

			/**
			 * The stop this model falls back to: its declared default, or the
			 * provider default row when the model declares none.
			 */
			const defaultIndex = (() => {
				if (reasoning === undefined) return -1;
				if (reasoning.defaultEffort !== undefined) {
					for (let i = 0; i < stops.length; i += 1) {
						if (stops[i].id === reasoning.defaultEffort) return i;
					}
					return -1;
				}
				for (let i = 0; i < stops.length; i += 1) {
					if (stops[i].id === undefined) return i;
				}
				return -1;
			})();

			/**
			 * Restore the effort this model ships with.
			 * @returns nothing.
			 */
			const resetEffort = () => {
				if (defaultIndex < 0 || defaultIndex === shownIndex) return;
				commitStop(defaultIndex);
			};

			/* ---------------- trigger ---------------- */

			const trigger = h(`button`, {
				ref: triggerRef,
				type: `button`,
				className: `rs-trigger`,
				disabled: lockedOut,
				'aria-haspopup': `menu`,
				'aria-expanded': open ? `true` : `false`,
				'aria-label': t(`triggerAria`, { model: modelLabel, effort: effortLabel || t(`providerDefault`) }),
				onClick: () => { if (!lockedOut) setOpen((value) => !value); },
				onKeyDown: (event) => {
					if (event.key === `ArrowDown` && !lockedOut) {
						event.preventDefault();
						setOpen(true);
					}
				},
			}, [
				h(primitives.IconDataOutlineRegular, { key: `icon`, className: `rs-triggerIcon` }),
				h(`span`, { key: `label`, className: `rs-triggerLabel` }, modelLabel),
				stops.length > 1
					? h(MiniTrack, { key: `mini`, stops, index: baseIndex < 0 ? 0 : baseIndex })
					: null,
				effortLabel === ``
					? null
					: h(`span`, { key: `effort`, className: `rs-triggerEffort` }, effortLabel),
				busy
					? h(primitives.StateDot, { key: `busy`, state: `ongoing` })
					: h(primitives.IconChevronDownOutlineRegular, {
						key: `chevron`,
						className: open ? `rs-chevron rs-chevronOpen` : `rs-chevron`,
					}),
			]);

			/* ---------------- menu ---------------- */

			/**
			 * The `模型` + `推理等级` block of the root pane.
			 * @returns the root pane children.
			 */
			const rootCells = [];

			/**
			 * The subtitle row that opens the model list.
			 * @returns the row element.
			 */
			const modelRow = h(`button`, {
				key: `model`,
				type: `button`,
				className: `rs-sub`,
				title: t(`selectModel`),
				onClick: () => setPane(`model`),
			}, [
				h(`span`, { key: `n`, className: `rs-subName` }, modelLabel),
				h(primitives.IconChevronRightOutlineRegular, { key: `c`, className: `rs-cellChevron` }),
			]);

			if (stops.length > 0) {
				const disabled = busy || lockedOut;
				rootCells.push(h(`div`, { key: `effort`, className: `rs-card` }, [
					h(`div`, { key: `head`, className: `rs-head` }, [
						h(Bolt, { key: `bolt` }),
						h(`span`, {
							key: `v`,
							className: `rs-value`,
							title: shownStop === undefined || shownStop.description === undefined
								? undefined
								: shownStop.description,
						}, effortLabel),
						h(`button`, {
							key: `reset`,
							type: `button`,
							className: `rs-reset`,
							disabled: disabled || defaultIndex < 0 || defaultIndex === shownIndex,
							'aria-label': t(`resetEffort`),
							title: t(`resetEffort`),
							onClick: resetEffort,
						}, h(primitives.IconRefreshOutlineRegular, {})),
					]),
					modelRow,
					h(EffortSlider, {
						key: `slider`,
						stops,
						index: shownIndex,
						disabled,
						t,
						onPreview: (index) => setPreview(index),
						onCommit: commitStop,
					}),
				]));
			} else {
				const note = reasoning !== undefined && reasoning.efforts.length === 0
					? h(`div`, { key: `none`, className: `rs-empty` }, t(`emptyEfforts`))
					: state.status === `loading`
						? h(`div`, { key: `loading`, className: `rs-status` }, t(`loading`))
						: state.routable === false
							? h(`div`, { key: `noroute`, className: `rs-empty` }, t(`emptyModels`))
							: null;
				rootCells.push(h(`div`, { key: `effort`, className: `rs-card` }, [modelRow, note]));
			}

			/**
			 * The model drill-down pane.
			 * @returns the pane children.
			 */
			const modelPane = () => {
				const children = [];
				children.push(h(`button`, {
					key: `back`,
					type: `button`,
					className: `rs-cell`,
					onClick: () => { setPane(`root`); setQuery(``); },
				}, [
					h(primitives.IconChevronLeftOutlineRegular, { key: `c`, className: `rs-back` }),
					h(`span`, { key: `l`, className: `rs-cellLabel` }, t(`model`)),
					h(`span`, { key: `v`, className: `rs-cellValue` }, modelLabel),
				]));

				if (state.error !== null && state.error !== undefined) {
					children.push(h(`div`, { key: `error`, className: `rs-error` }, [
						h(`span`, { key: `m` }, String(state.error)),
						h(`button`, {
							key: `r`,
							type: `button`,
							className: `rs-retry`,
							onClick: () => { const run = loadRef.current; if (typeof run === `function`) run(); },
						}, t(`retry`)),
					]));
				}

				const filteredGroups = orderGroups(groups)
					.map((group) => ({ group, models: rankModels(group.models, query) }))
					.filter((entry) => entry.models.length > 0);

				if (choices.length > 4) {
					children.push(h(`div`, { key: `search`, className: `rs-searchRow` }, [
						h(primitives.Input, {
							key: `i`,
							className: query === `` ? `rs-search` : `rs-search rs-searchWithQuery`,
							type: `text`,
							role: `searchbox`,
							'aria-label': t(`searchPlaceholder`),
							placeholder: t(`searchPlaceholder`),
							value: query,
							readOnly: busy,
							onChange: (event) => setQuery(event.target.value),
						}),
						query === ``
							? null
							: h(`button`, {
								key: `c`,
								type: `button`,
								className: `rs-searchClear`,
								'aria-label': t(`searchClear`),
								onClick: () => setQuery(``),
							}, h(primitives.IconCloseFillRegular, {})),
					]));
				}

				const list = [];
				for (const entry of filteredGroups) {
					if (filteredGroups.length > 1 || groups.length > 1) {
						list.push(h(`div`, { key: `g${String(entry.group.id)}`, className: `rs-groupLabel` }, entry.group.name));
					}
					for (const model of entry.models) {
						const selected = current !== null
							&& current.provider === entry.group.id
							&& current.model === model.id;
						list.push(h(`button`, {
							key: `m${String(entry.group.id)}:${String(model.id)}`,
							type: `button`,
							role: `menuitemradio`,
							'aria-checked': selected ? `true` : `false`,
							className: `rs-option`,
							disabled: busy,
							title: model.description === undefined ? model.name : model.description,
							onClick: () => commitModel({
								group: entry.group,
								model,
								selection: selectionFor(
									entry.group,
									model,
									model.reasoning === undefined ? undefined : model.reasoning.defaultEffort),
							}),
						}, [
							h(`span`, { key: `copy`, className: `rs-optionCopy` }, [
								h(`span`, { key: `n`, className: `rs-modelName` }, model.name),
							]),
							selected
								? h(primitives.IconCheckOutlineRegular, { key: `c`, className: `rs-check` })
								: null,
						]));
					}
				}

				const failures = state.failures === undefined ? [] : state.failures;
				for (const failure of failures) {
					list.push(h(`div`, { key: `f${String(failure.id)}`, className: `rs-groupFailure` },
						`${failure.name}: ${failure.message}`));
				}

				if (list.length === 0) {
					list.push(h(`div`, {
						key: `empty`,
						className: `rs-empty`,
					}, state.status === `loading` ? t(`loading`) : query === `` ? t(`emptyModels`) : t(`searchEmpty`)));
				}

				children.push(h(`div`, { key: `list`, className: `rs-list` }, list));
				return children;
			};

			const menu = !open ? null : ReactDOM.createPortal(
				h(primitives.MenuSurface, {
					ref: menuRef,
					id: `${ID}-menu`,
					className: pane === `root` ? `rs-menu rs-menuCard` : `rs-menu`,
					style: position === null
						? { visibility: `hidden`, left: 0, top: 0 }
						: position,
					role: pane === `model` ? `group` : `menu`,
					'aria-label': t(`menuAria`),
					'aria-busy': busy || state.status === `loading` ? `true` : `false`,
				}, pane === `root` ? rootCells : modelPane()),
				document.body);

			return h(`div`, { className: `rs-root` }, [trigger, menu]);
		}

		/* ------------------------------------------------------------------ *
		 * plugin
		 * ------------------------------------------------------------------ */

		/**
		 * Services this client plugin needs before `apply` can run.
		 *
		 * `remote` and `remote.session` are not used directly: the
		 * `modelDirectories.directoryFor()` implementation itself touches
		 * `ctx.remote.session` and `ctx.sessions`, and Cordis evaluates that
		 * access against this declaration — without them the call throws
		 * `cannot get property "remote.session" without inject` and the seat
		 * entry crashes.
		 */
		const inject = [
			`slots`,
			`locale`,
			`modelDirectories`,
			`sessions`,
			`remote`,
			`remote.session`,
		];

		/**
		 * Register the locale dictionaries and the shadowing seat.
		 * @param ctx - the client plugin context.
		 * @returns nothing.
		 */
		function apply(ctx) {
			installStyles();
			ctx.effect(() => {
				const disposers = [];
				try {
					disposers.push(ctx.locale.register(NS, `zh`, ZH));
					disposers.push(ctx.locale.register(NS, `en`, EN));
				} catch (error) {
					// A locale signature drift must not take the seat down.
					console.warn(`${ID}: locale registration failed`, error);
				}
				return () => {
					for (const dispose of disposers) {
						if (typeof dispose === `function`) dispose();
					}
				};
			}, `${ID}: locale dictionaries`);

			ctx.inject([`slots`, `modelDirectories`, `sessions`, `remote`, `remote.session`], (scope) => {
				const models = scope.modelDirectories;
				const sessions = scope.sessions;
				scope.slots.inject(SLOT, () => scope.slots.register({
					name: SLOT,
					locale: NS,
					priority: SHADOW_PRIORITY,
					inject: (sessionId) => {
						const directory = models.directoryFor(sessionId);
						const available = sessions.subagentAddress(sessionId) === undefined;
						return {
							available,
							directory: directory.store,
							load: () => {
								if (available) directory.load().catch(() => {});
							},
							select: (selection) => (available
								? directory.select(selection)
								: Promise.resolve(undefined)),
						};
					},
				}, ReasoningSlider));
			});
		}

		exports.name = ID;
		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	},
});
