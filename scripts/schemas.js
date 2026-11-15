const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const GM = require(path.join(root, "media", "builder", "model.js"));
const BASE = "https://raw.githubusercontent.com/goome-ui/vscode-goome/main/schemas/";

const color = { type: "integer", minimum: 0, maximum: 4294967295, description: "0xAARRGGBB as a number" };
const num = { type: "number" };
const numOrExpr = { type: ["number", "string", "boolean"] };
const str = { type: "string" };
const bool = { type: "boolean" };
const bit = { enum: [0, 1, true, false] };

function sizeProp(k) {
  const r = GM.SIZE_RANGE[k];
  const out = { type: "number" };
  if (r) out.description = "builder range " + r[0] + " to " + r[1];
  if (GM.THEME_HINT[k]) out.description = (out.description ? out.description + ", " : "") + GM.THEME_HINT[k];
  return out;
}

function themeDefs() {
  const props = {
    format: { const: "goome-theme" },
    id: str,
    name: str,
    base: { enum: ["dark", "light"] },
    preset: bool,
    icon_tint: bit,
    icons: { type: "object", propertyNames: { enum: GM.ICON_NAMES }, additionalProperties: { type: "object", properties: { img: str, file: str }, required: ["img"] } },
    quick: { type: "object", properties: { accent: color, dark: bool, radius: num, scale: { type: "number", exclusiveMinimum: 0, maximum: 4 } } },
  };
  for (const k of GM.THEME_COLORS) props[k] = Object.assign({}, color, GM.THEME_HINT[k] ? { description: GM.THEME_HINT[k] + ", 0 = auto" } : {});
  for (const k of GM.THEME_SIZES) props[k] = sizeProp(k);
  for (const k of GM.THEME_FONTS) props[k] = { type: "string", maxLength: 80, description: GM.THEME_HINT[k] || "" };
  const skin = { oneOf: [{ type: "null" }, { type: "object", properties: { img: str, file: str, l: num, t: num, r: num, b: num, iw: num, ih: num }, required: ["img"] }] };
  for (const k of GM.THEME_SKINS.concat(GM.EXTRA_SKINS)) props[k] = skin;
  delete props.format;
  return { type: "object", properties: props };
}

function configDef() {
  const props = {};
  for (const [k, , lo, hi, about] of GM.CFG_NUMS) props[k] = { type: "number", minimum: lo, maximum: hi, description: about };
  for (const [k, , about] of GM.CFG_TOGGLES) props[k] = Object.assign({}, bit, { description: about });
  const cur = {};
  for (const [k] of GM.CFG_CURSORS) cur[k] = { enum: GM.CURSOR_SHAPES };
  props.cursor = { type: "object", properties: cur };
  const keys = {};
  for (const [k, d] of GM.CFG_KEYS) keys[k] = { type: "string", description: "like " + d };
  props.keys = { type: "object", properties: keys };
  props.mask = { type: "string", description: "password mask character" };
  return { type: "object", properties: props };
}

function projectSchema() {
  const types = Object.keys(GM.TYPES);
  const action = { type: "object", properties: { do: { enum: Object.keys(GM.ACTION_KINDS) }, var: str, value: { type: ["string", "number", "boolean"] }, target: str, tab: num, text: str, ms: num, fn: str }, required: ["do"] };
  const style = {
    type: "object",
    properties: {
      theme: { type: ["string", "null"] },
      c: { type: "object", propertyNames: { enum: GM.THEME_COLORS }, additionalProperties: color },
      n: { type: "object", propertyNames: { enum: GM.THEME_SIZES }, additionalProperties: num },
      radii: { type: "array", items: num, minItems: 4, maxItems: 4 },
    },
  };
  const seen = {};
  for (const t of types) for (const [k, v] of Object.entries(GM.TYPES[t].p)) {
    const ty = typeof v === "boolean" ? "boolean" : typeof v === "number" ? "number" : typeof v === "string" ? "string" : "object";
    (seen[k] = seen[k] || new Set()).add(ty);
  }
  const pprops = {};
  for (const [k, set] of Object.entries(seen)) pprops[k] = k === "color" ? color : { type: set.size === 1 ? [...set][0] : [...set].sort() };
  pprops.bind = str;
  pprops.showIf = str;
  pprops.enable = { type: ["string", "boolean"] };
  pprops.show = { type: ["string", "boolean"] };
  const node = {
    type: "object",
    properties: {
      id: str,
      type: { enum: types, description: "a widget type from the builder" },
      p: { type: "object", properties: pprops },
      kids: { type: "array", items: { type: "array", items: { $ref: "#/definitions/node" } } },
      style,
      slotStyle: { type: "array", items: { oneOf: [{ type: "null" }, style] } },
      abs: { type: ["object", "null"], properties: { x: num, y: num, w: num, h: num } },
      on: { type: "object", propertyNames: { enum: Object.keys(GM.EVENT_NAMES) }, additionalProperties: { type: "array", items: action } },
    },
    required: ["type"],
  };
  const part = {
    type: "object",
    properties: {
      id: str,
      kind: { enum: Object.keys(GM.PART_KINDS) },
      name: str,
      show: str,
      hit: bool,
      f: { type: "object", additionalProperties: numOrExpr },
      kids: { type: "array", items: { $ref: "#/definitions/part" } },
      drag: { type: "object", properties: { on: bool, axis: str, snap: num, bounds: str, rect: { type: "object", properties: { x: num, y: num, w: num, h: num } }, handle: str } },
      w: { $ref: "#/definitions/node" },
    },
    required: ["kind"],
  };
  const field = (types) => ({ type: "object", properties: { name: str, type: { enum: types }, def: { type: ["number", "string", "boolean"] } }, required: ["name"] });
  const element = {
    type: "object",
    properties: {
      id: str,
      name: str,
      about: str,
      w: num,
      h: num,
      resizable: { type: "object", properties: { on: bool, minW: num, minH: num, maxW: num, maxH: num } },
      params: { type: "array", items: field(["num", "color", "bool", "text"]) },
      state: { type: "array", items: field(["num", "bool"]) },
      hit: str,
      value: { type: "object", properties: { src: str, state: str, part: str, axis: str, min: num, max: num } },
      events: { type: "array", items: { type: "object", properties: { on: str, act: str, target: str, expr: str, text: str } } },
      parts: { type: "array", items: { $ref: "#/definitions/part" } },
    },
  };
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: BASE + "goome-project.schema.json",
    title: "goome ui builder project",
    description: "a .goome.json from the goome ui builder, https://goome-ui.github.io/docs/builder/",
    type: "object",
    properties: {
      format: { const: "goome-project" },
      version: { type: "integer", minimum: 1 },
      name: str,
      mode: { enum: ["overlay", "app"] },
      title: str,
      app: { type: "object", properties: { w: num, h: num, titlebar: bool, menubar: bool, statusbar: bool, nopad: bool, status: str } },
      root: { type: "array", items: { $ref: "#/definitions/node" } },
      theme: { $ref: "#/definitions/theme" },
      themes: { type: "array", items: { $ref: "#/definitions/theme" } },
      elements: { type: "array", items: { $ref: "#/definitions/element" } },
      grid: { type: "object", properties: { size: num, snap: bool, show: bool } },
      vars: { type: "array", items: { type: "object", properties: { id: str, name: str, type: { enum: Object.keys(GM.VAR_TYPES) }, def: { type: ["number", "string", "boolean"] }, min: num, max: num }, required: ["name", "type"] } },
      hotkeys: { type: "array", items: { type: "object", properties: { id: str, combo: { type: "string", description: "like ctrl+m or alt+shift+f1" }, actions: { type: "array", items: action } }, required: ["combo"] } },
      config: { $ref: "#/definitions/config" },
      settings: { type: "object" },
    },
    required: ["format"],
    definitions: { node, part, element, theme: themeDefs(), config: configDef() },
  };
}

function themeSchema() {
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: BASE + "goome-theme.schema.json",
    title: "goome theme",
    description: "a .goome-theme.json exported from the goome ui builder",
    type: "object",
    properties: {
      format: { const: "goome-theme" },
      version: { type: "integer", minimum: 1 },
      theme: { $ref: "#/definitions/theme" },
    },
    required: ["format", "theme"],
    definitions: { theme: themeDefs() },
  };
}

const out = path.join(root, "schemas");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "goome-project.schema.json"), JSON.stringify(projectSchema(), null, 2) + "\n");
fs.writeFileSync(path.join(out, "goome-theme.schema.json"), JSON.stringify(themeSchema(), null, 2) + "\n");
console.log("wrote schemas/goome-project.schema.json and schemas/goome-theme.schema.json");
