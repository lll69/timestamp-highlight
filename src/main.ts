import { Decoration, DecorationSet, ViewPlugin, ViewUpdate, hoverTooltip } from "@codemirror/view";
import { StreamLanguage, syntaxHighlighting } from "@codemirror/language";
import { EditorState, StateEffect, StateField, Compartment, Range } from "@codemirror/state";
import { selectAll } from "@codemirror/commands";
import { cpp } from "@codemirror/lang-cpp";
import { css } from "@codemirror/lang-css";
import { go } from "@codemirror/lang-go";
import { html } from "@codemirror/lang-html";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { php } from "@codemirror/lang-php";
import { python } from "@codemirror/lang-python";
import { rust } from "@codemirror/lang-rust";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { csharp, kotlin } from "@codemirror/legacy-modes/mode/clike";
import { swift } from "@codemirror/legacy-modes/mode/swift";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { oneDarkTheme } from "@codemirror/theme-one-dark";
import { EditorView, basicSetup } from "codemirror";
import { formatLocal, formatUTC, matchStamp, scanTokens } from "./util";

const MIN_MS = 315532800000; // 1980-01-01T00:00:00Z
const MAX_MS = 7258118399000; // 2199-12-31T23:59:59Z

const LANGS = [
    { id: "txt", label: "Plain Text", ext: () => [] },
    { id: "cpp", label: "C/C++", ext: () => cpp() },
    { id: "csharp", label: "C#", ext: () => StreamLanguage.define(csharp) },
    { id: "css", label: "CSS", ext: () => css() },
    { id: "go", label: "Go", ext: () => go() },
    { id: "html", label: "HTML", ext: () => html() },
    { id: "java", label: "Java", ext: () => java() },
    { id: "javascript", label: "JS", ext: () => javascript() },
    { id: "jsx", label: "JSX", ext: () => javascript({ jsx: true }) },
    { id: "json", label: "JSON", ext: () => json() },
    { id: "kotlin", label: "Kotlin/KT", ext: () => StreamLanguage.define(kotlin) },
    { id: "markdown", label: "Markdown/MD", ext: () => markdown() },
    { id: "php", label: "PHP", ext: () => php() },
    { id: "properties", label: "Prop", ext: () => StreamLanguage.define(properties) },
    { id: "python", label: "Python", ext: () => python() },
    { id: "rust", label: "Rust", ext: () => rust() },
    { id: "swift", label: "Swift", ext: () => StreamLanguage.define(swift) },
    { id: "shell", label: "Shell", ext: () => StreamLanguage.define(shell) },
    { id: "typescript", label: "TS", ext: () => javascript({ typescript: true }) },
    { id: "tsx", label: "TSX", ext: () => javascript({ jsx: true, typescript: true }) },
    { id: "xml", label: "XML", ext: () => xml() },
    { id: "yaml", label: "YAML", ext: () => yaml() },
];

const langConf = new Compartment();
const themeConf = new Compartment();

type Config = {
    minMs: number,
    maxMs: number,
    balloon: boolean
};
const setCfg = StateEffect.define<Config>();
const cfgField = StateField.define<Config>({
    create: () => ({ minMs: MIN_MS, maxMs: MAX_MS, balloon: false }),
    update(v, tr) {
        for (const e of tr.effects) if (e.is(setCfg)) v = Object.assign({}, v, e.value);
        return v;
    },
});

const decoCache = new Map<string, Decoration>();
function decoFor(kind: string, balloonText: string) {
    const key = kind + "|" + balloonText;
    let d = decoCache.get(key);
    if (!d) {
        if (decoCache.size > 4000) decoCache.clear();
        const attrs = { "data-ts": "1" };
        if (balloonText) attrs["data-balloon"] = balloonText;
        d = Decoration.mark({ class: "cm-timestamp cm-timestamp-" + kind, attributes: attrs });
        decoCache.set(key, d);
    }
    return d;
}

function mapKind(isMs: boolean, isSec: boolean) {
    return (isMs && isSec) ? "both" : isMs ? "ms" : "sec";
}

function tokenAt(state: EditorState, pos: number) {
    const line = state.doc.lineAt(pos);
    for (const tk of scanTokens(line.text, line.from)) {
        if (pos >= tk.from && pos <= tk.to) return tk;
    }
    return null;
}

function buildBalloonText(info) {
    let balloon: string[] = [];
    if (info.isMs) {
        balloon.push(`${formatLocal(info.num)}(local ms)`);
        balloon.push(`${formatUTC(info.num)}(UTC ms)`);
    }
    if (info.isSec) {
        balloon.push(`${formatLocal(info.num * 1000)}(local sec)`);
        balloon.push(`${formatUTC(info.num * 1000)}(UTC sec)`);
    }
    return balloon;
}

const tsHover = hoverTooltip((view, pos) => {
    const t = tokenAt(view.state, pos);
    if (!t) return null;
    const cfg = view.state.field(cfgField);
    const info = matchStamp(t.raw, cfg.minMs, cfg.maxMs);
    if (!info) return null;

    const dom = document.createElement("div");
    dom.className = "ts-tip";
    const raw = document.createElement("code");
    raw.className = "ts-raw";
    raw.textContent = buildBalloonText(info).join("\n");
    dom.append(raw);
    return { pos: t.from, end: t.to, above: true, create: () => ({ dom }) };
}, { hoverTime: 1 });

function buildDeco(view: EditorView) {
    const cfg = view.state.field(cfgField);
    const b: Range<Decoration>[] = [];
    for (const { from, to } of view.visibleRanges) {
        const text = view.state.sliceDoc(from, to);
        for (const tk of scanTokens(text, from)) {
            const info = matchStamp(tk.raw, cfg.minMs, cfg.maxMs);
            if (!info) continue;
            const from = tk.from, to = tk.to;
            b.push(decoFor(mapKind(info.isMs, info.isSec), buildBalloonText(info).join(cfg.balloon ? " | " : "\n")).range(from, to));
        }
    }
    return Decoration.set(b, true);
}

const timeHighlighter = ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
        this.decorations = buildDeco(view);
    }
    update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged ||
            u.startState.field(cfgField) !== u.state.field(cfgField)) {
            this.decorations = buildDeco(u.view);
        }
    }
}, { decorations: v => v.decorations });

const SAMPLE = `{
  /* Paste text here... */
  "1428463372": "dns",
  "1428463929050": "zodiac",
  "0x5524dfe3": "tagster",
  "1428486212486.58": "labelauty",
  "0X14c986d3c70": "radial",
  "1428486679.751": "logo"
}`;

const editorDiv = document.getElementById("editor") as HTMLDivElement;
editorDiv.innerHTML = "";

const editor = new EditorView({
    state: EditorState.create({
        doc: SAMPLE,
        extensions: [
            basicSetup,
            EditorView.lineWrapping,
            langConf.of([]),
            themeConf.of([]),
            cfgField,
            timeHighlighter,
            // tsHover,
            // EditorView.updateListener.of(u => { if (u.docChanged) updateCount(); }),
        ],
    }),
    parent: editorDiv,
});
selectAll(editor);
editor.focus();

document.getElementById("clear")!.addEventListener("click", () => {
    editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: "" },
    });
    editor.focus();
});

const langSelect = document.getElementById("lang-select") as HTMLSelectElement;
for (const lang of LANGS) {
    const entry = document.createElement("option");
    entry.textContent = lang.label;
    entry.value = lang.id;
    langSelect.appendChild(entry);
}
langSelect.selectedIndex = 0;
langSelect.addEventListener("change", () => {
    editor.dispatch({ effects: langConf.reconfigure(LANGS[langSelect.selectedIndex].ext()) });
});

let mouseX = 0, mouseY = 0, isTouch = false;

const balloonStyle = document.getElementById("balloon-style") as HTMLStyleElement;
function updateBalloonCss() {
    if (!balloonCheck.checked && !isTouch) {
        const { width, height } = editorDiv.getBoundingClientRect();
        const left = mouseX < width / 2;
        const top = mouseY < height / 2;
        const css = `body.balloon-on .cm-timestamp::after,.cm-timestamp:hover::after{${left ? "left" : "right"}:${left ? mouseX : width - mouseX}px;${top ? "top" : "bottom"}:${top ? mouseY : height - mouseY}px;}`;
        balloonStyle.textContent = css;
    } else {
        balloonStyle.textContent = "";
    }
}

const balloonCheck = document.getElementById("balloon-check") as HTMLInputElement;
balloonCheck.checked = false;
balloonCheck.addEventListener("change", () => {
    if (balloonCheck.checked) {
        document.body.classList.add("balloon-on");
    } else {
        document.body.classList.remove("balloon-on");
    }
    const cfg = editor.state.field(cfgField);
    editor.dispatch({
        effects: setCfg.of({ minMs: cfg.minMs, maxMs: cfg.maxMs, balloon: balloonCheck.checked }),
    });
    updateBalloonCss();
});

editorDiv.addEventListener("pointermove", (e) => {
    isTouch = e.pointerType == "touch";
    const { top, left } = editorDiv.getBoundingClientRect();
    mouseX = e.pageX - left;
    mouseY = e.pageY - top;
    updateBalloonCss();
});

let isDark = matchMedia("(prefers-color-scheme:dark)").matches;
const darkSelect = document.getElementById("dark-select") as HTMLSelectElement;
darkSelect.selectedIndex = isDark ? 1 : 0;
function changeDark() {
    themeConf.reconfigure(isDark ? [oneDarkTheme] : []);
    if (isDark) {
        document.documentElement.classList.add("dark");
    } else {
        document.documentElement.classList.remove("dark");
    }
}
changeDark();
darkSelect.addEventListener("change", () => {
    isDark = darkSelect.selectedIndex == 1;
    changeDark();
});

const minTimeInput = document.getElementById("min-time-input") as HTMLInputElement;
const maxTimeInput = document.getElementById("max-time-input") as HTMLInputElement;
function inputTime() {
    const cfg = editor.state.field(cfgField);
    editor.dispatch({
        effects: setCfg.of({ minMs: minTimeInput.valueAsNumber, maxMs: maxTimeInput.valueAsNumber, balloon: cfg.balloon }),
    });
}
minTimeInput.valueAsNumber = MIN_MS;
maxTimeInput.valueAsNumber = MAX_MS;
minTimeInput.addEventListener("input", inputTime);
maxTimeInput.addEventListener("input", inputTime);
