"use strict";
var StyleScene = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/scene.js
  var scene_exports = {};
  __export(scene_exports, {
    init: () => init,
    render: () => render,
    whenReady: () => whenReady
  });

  // ../../../../node_modules/roughjs/bundled/rough.esm.js
  function t(t2, e2, s2) {
    if (t2 && t2.length) {
      const [n2, o2] = e2, a2 = Math.PI / 180 * s2, h2 = Math.cos(a2), r2 = Math.sin(a2);
      for (const e3 of t2) {
        const [t3, s3] = e3;
        e3[0] = (t3 - n2) * h2 - (s3 - o2) * r2 + n2, e3[1] = (t3 - n2) * r2 + (s3 - o2) * h2 + o2;
      }
    }
  }
  function e(t2, e2) {
    return t2[0] === e2[0] && t2[1] === e2[1];
  }
  function s(s2, n2, o2, a2 = 1) {
    const h2 = o2, r2 = Math.max(n2, 0.1), i2 = s2[0] && s2[0][0] && "number" == typeof s2[0][0] ? [s2] : s2, c2 = [0, 0];
    if (h2) for (const e2 of i2) t(e2, c2, h2);
    const l2 = (function(t2, s3, n3) {
      const o3 = [];
      for (const s4 of t2) {
        const t3 = [...s4];
        e(t3[0], t3[t3.length - 1]) || t3.push([t3[0][0], t3[0][1]]), t3.length > 2 && o3.push(t3);
      }
      const a3 = [];
      s3 = Math.max(s3, 0.1);
      const h3 = [];
      for (const t3 of o3) for (let e2 = 0; e2 < t3.length - 1; e2++) {
        const s4 = t3[e2], n4 = t3[e2 + 1];
        if (s4[1] !== n4[1]) {
          const t4 = Math.min(s4[1], n4[1]);
          h3.push({ ymin: t4, ymax: Math.max(s4[1], n4[1]), x: t4 === s4[1] ? s4[0] : n4[0], islope: (n4[0] - s4[0]) / (n4[1] - s4[1]) });
        }
      }
      if (h3.sort(((t3, e2) => t3.ymin < e2.ymin ? -1 : t3.ymin > e2.ymin ? 1 : t3.x < e2.x ? -1 : t3.x > e2.x ? 1 : t3.ymax === e2.ymax ? 0 : (t3.ymax - e2.ymax) / Math.abs(t3.ymax - e2.ymax))), !h3.length) return a3;
      let r3 = [], i3 = h3[0].ymin, c3 = 0;
      for (; r3.length || h3.length; ) {
        if (h3.length) {
          let t3 = -1;
          for (let e2 = 0; e2 < h3.length && !(h3[e2].ymin > i3); e2++) t3 = e2;
          h3.splice(0, t3 + 1).forEach(((t4) => {
            r3.push({ s: i3, edge: t4 });
          }));
        }
        if (r3 = r3.filter(((t3) => !(t3.edge.ymax <= i3))), r3.sort(((t3, e2) => t3.edge.x === e2.edge.x ? 0 : (t3.edge.x - e2.edge.x) / Math.abs(t3.edge.x - e2.edge.x))), (1 !== n3 || c3 % s3 == 0) && r3.length > 1) for (let t3 = 0; t3 < r3.length; t3 += 2) {
          const e2 = t3 + 1;
          if (e2 >= r3.length) break;
          const s4 = r3[t3].edge, n4 = r3[e2].edge;
          a3.push([[Math.round(s4.x), i3], [Math.round(n4.x), i3]]);
        }
        i3 += n3, r3.forEach(((t3) => {
          t3.edge.x = t3.edge.x + n3 * t3.edge.islope;
        })), c3++;
      }
      return a3;
    })(i2, r2, a2);
    if (h2) {
      for (const e2 of i2) t(e2, c2, -h2);
      !(function(e2, s3, n3) {
        const o3 = [];
        e2.forEach(((t2) => o3.push(...t2))), t(o3, s3, n3);
      })(l2, c2, -h2);
    }
    return l2;
  }
  function n(t2, e2) {
    var n2;
    const o2 = e2.hachureAngle + 90;
    let a2 = e2.hachureGap;
    a2 < 0 && (a2 = 4 * e2.strokeWidth), a2 = Math.round(Math.max(a2, 0.1));
    let h2 = 1;
    return e2.roughness >= 1 && ((null === (n2 = e2.randomizer) || void 0 === n2 ? void 0 : n2.next()) || Math.random()) > 0.7 && (h2 = a2), s(t2, a2, o2, h2 || 1);
  }
  var o = class {
    constructor(t2) {
      this.helper = t2;
    }
    fillPolygons(t2, e2) {
      return this._fillPolygons(t2, e2);
    }
    _fillPolygons(t2, e2) {
      const s2 = n(t2, e2);
      return { type: "fillSketch", ops: this.renderLines(s2, e2) };
    }
    renderLines(t2, e2) {
      const s2 = [];
      for (const n2 of t2) s2.push(...this.helper.doubleLineOps(n2[0][0], n2[0][1], n2[1][0], n2[1][1], e2));
      return s2;
    }
  };
  function a(t2) {
    const e2 = t2[0], s2 = t2[1];
    return Math.sqrt(Math.pow(e2[0] - s2[0], 2) + Math.pow(e2[1] - s2[1], 2));
  }
  var h = class extends o {
    fillPolygons(t2, e2) {
      let s2 = e2.hachureGap;
      s2 < 0 && (s2 = 4 * e2.strokeWidth), s2 = Math.max(s2, 0.1);
      const o2 = n(t2, Object.assign({}, e2, { hachureGap: s2 })), h2 = Math.PI / 180 * e2.hachureAngle, r2 = [], i2 = 0.5 * s2 * Math.cos(h2), c2 = 0.5 * s2 * Math.sin(h2);
      for (const [t3, e3] of o2) a([t3, e3]) && r2.push([[t3[0] - i2, t3[1] + c2], [...e3]], [[t3[0] + i2, t3[1] - c2], [...e3]]);
      return { type: "fillSketch", ops: this.renderLines(r2, e2) };
    }
  };
  var r = class extends o {
    fillPolygons(t2, e2) {
      const s2 = this._fillPolygons(t2, e2), n2 = Object.assign({}, e2, { hachureAngle: e2.hachureAngle + 90 }), o2 = this._fillPolygons(t2, n2);
      return s2.ops = s2.ops.concat(o2.ops), s2;
    }
  };
  var i = class {
    constructor(t2) {
      this.helper = t2;
    }
    fillPolygons(t2, e2) {
      const s2 = n(t2, e2 = Object.assign({}, e2, { hachureAngle: 0 }));
      return this.dotsOnLines(s2, e2);
    }
    dotsOnLines(t2, e2) {
      const s2 = [];
      let n2 = e2.hachureGap;
      n2 < 0 && (n2 = 4 * e2.strokeWidth), n2 = Math.max(n2, 0.1);
      let o2 = e2.fillWeight;
      o2 < 0 && (o2 = e2.strokeWidth / 2);
      const h2 = n2 / 4;
      for (const r2 of t2) {
        const t3 = a(r2), i2 = t3 / n2, c2 = Math.ceil(i2) - 1, l2 = t3 - c2 * n2, u2 = (r2[0][0] + r2[1][0]) / 2 - n2 / 4, p2 = Math.min(r2[0][1], r2[1][1]);
        for (let t4 = 0; t4 < c2; t4++) {
          const a2 = p2 + l2 + t4 * n2, r3 = u2 - h2 + 2 * Math.random() * h2, i3 = a2 - h2 + 2 * Math.random() * h2, c3 = this.helper.ellipse(r3, i3, o2, o2, e2);
          s2.push(...c3.ops);
        }
      }
      return { type: "fillSketch", ops: s2 };
    }
  };
  var c = class {
    constructor(t2) {
      this.helper = t2;
    }
    fillPolygons(t2, e2) {
      const s2 = n(t2, e2);
      return { type: "fillSketch", ops: this.dashedLine(s2, e2) };
    }
    dashedLine(t2, e2) {
      const s2 = e2.dashOffset < 0 ? e2.hachureGap < 0 ? 4 * e2.strokeWidth : e2.hachureGap : e2.dashOffset, n2 = e2.dashGap < 0 ? e2.hachureGap < 0 ? 4 * e2.strokeWidth : e2.hachureGap : e2.dashGap, o2 = [];
      return t2.forEach(((t3) => {
        const h2 = a(t3), r2 = Math.floor(h2 / (s2 + n2)), i2 = (h2 + n2 - r2 * (s2 + n2)) / 2;
        let c2 = t3[0], l2 = t3[1];
        c2[0] > l2[0] && (c2 = t3[1], l2 = t3[0]);
        const u2 = Math.atan((l2[1] - c2[1]) / (l2[0] - c2[0]));
        for (let t4 = 0; t4 < r2; t4++) {
          const a2 = t4 * (s2 + n2), h3 = a2 + s2, r3 = [c2[0] + a2 * Math.cos(u2) + i2 * Math.cos(u2), c2[1] + a2 * Math.sin(u2) + i2 * Math.sin(u2)], l3 = [c2[0] + h3 * Math.cos(u2) + i2 * Math.cos(u2), c2[1] + h3 * Math.sin(u2) + i2 * Math.sin(u2)];
          o2.push(...this.helper.doubleLineOps(r3[0], r3[1], l3[0], l3[1], e2));
        }
      })), o2;
    }
  };
  var l = class {
    constructor(t2) {
      this.helper = t2;
    }
    fillPolygons(t2, e2) {
      const s2 = e2.hachureGap < 0 ? 4 * e2.strokeWidth : e2.hachureGap, o2 = e2.zigzagOffset < 0 ? s2 : e2.zigzagOffset, a2 = n(t2, e2 = Object.assign({}, e2, { hachureGap: s2 + o2 }));
      return { type: "fillSketch", ops: this.zigzagLines(a2, o2, e2) };
    }
    zigzagLines(t2, e2, s2) {
      const n2 = [];
      return t2.forEach(((t3) => {
        const o2 = a(t3), h2 = Math.round(o2 / (2 * e2));
        let r2 = t3[0], i2 = t3[1];
        r2[0] > i2[0] && (r2 = t3[1], i2 = t3[0]);
        const c2 = Math.atan((i2[1] - r2[1]) / (i2[0] - r2[0]));
        for (let t4 = 0; t4 < h2; t4++) {
          const o3 = 2 * t4 * e2, a2 = 2 * (t4 + 1) * e2, h3 = Math.sqrt(2 * Math.pow(e2, 2)), i3 = [r2[0] + o3 * Math.cos(c2), r2[1] + o3 * Math.sin(c2)], l2 = [r2[0] + a2 * Math.cos(c2), r2[1] + a2 * Math.sin(c2)], u2 = [i3[0] + h3 * Math.cos(c2 + Math.PI / 4), i3[1] + h3 * Math.sin(c2 + Math.PI / 4)];
          n2.push(...this.helper.doubleLineOps(i3[0], i3[1], u2[0], u2[1], s2), ...this.helper.doubleLineOps(u2[0], u2[1], l2[0], l2[1], s2));
        }
      })), n2;
    }
  };
  var u = {};
  var p = class {
    constructor(t2) {
      this.seed = t2;
    }
    next() {
      return this.seed ? (2 ** 31 - 1 & (this.seed = Math.imul(48271, this.seed))) / 2 ** 31 : Math.random();
    }
  };
  var f = 0;
  var d = 1;
  var g = 2;
  var M = { A: 7, a: 7, C: 6, c: 6, H: 1, h: 1, L: 2, l: 2, M: 2, m: 2, Q: 4, q: 4, S: 4, s: 4, T: 2, t: 2, V: 1, v: 1, Z: 0, z: 0 };
  function k(t2, e2) {
    return t2.type === e2;
  }
  function b(t2) {
    const e2 = [], s2 = (function(t3) {
      const e3 = new Array();
      for (; "" !== t3; ) if (t3.match(/^([ \t\r\n,]+)/)) t3 = t3.substr(RegExp.$1.length);
      else if (t3.match(/^([aAcChHlLmMqQsStTvVzZ])/)) e3[e3.length] = { type: f, text: RegExp.$1 }, t3 = t3.substr(RegExp.$1.length);
      else {
        if (!t3.match(/^(([-+]?[0-9]+(\.[0-9]*)?|[-+]?\.[0-9]+)([eE][-+]?[0-9]+)?)/)) return [];
        e3[e3.length] = { type: d, text: `${parseFloat(RegExp.$1)}` }, t3 = t3.substr(RegExp.$1.length);
      }
      return e3[e3.length] = { type: g, text: "" }, e3;
    })(t2);
    let n2 = "BOD", o2 = 0, a2 = s2[o2];
    for (; !k(a2, g); ) {
      let h2 = 0;
      const r2 = [];
      if ("BOD" === n2) {
        if ("M" !== a2.text && "m" !== a2.text) return b("M0,0" + t2);
        o2++, h2 = M[a2.text], n2 = a2.text;
      } else k(a2, d) ? h2 = M[n2] : (o2++, h2 = M[a2.text], n2 = a2.text);
      if (!(o2 + h2 < s2.length)) throw new Error("Path data ended short");
      for (let t3 = o2; t3 < o2 + h2; t3++) {
        const e3 = s2[t3];
        if (!k(e3, d)) throw new Error("Param not a number: " + n2 + "," + e3.text);
        r2[r2.length] = +e3.text;
      }
      if ("number" != typeof M[n2]) throw new Error("Bad segment: " + n2);
      {
        const t3 = { key: n2, data: r2 };
        e2.push(t3), o2 += h2, a2 = s2[o2], "M" === n2 && (n2 = "L"), "m" === n2 && (n2 = "l");
      }
    }
    return e2;
  }
  function y(t2) {
    let e2 = 0, s2 = 0, n2 = 0, o2 = 0;
    const a2 = [];
    for (const { key: h2, data: r2 } of t2) switch (h2) {
      case "M":
        a2.push({ key: "M", data: [...r2] }), [e2, s2] = r2, [n2, o2] = r2;
        break;
      case "m":
        e2 += r2[0], s2 += r2[1], a2.push({ key: "M", data: [e2, s2] }), n2 = e2, o2 = s2;
        break;
      case "L":
        a2.push({ key: "L", data: [...r2] }), [e2, s2] = r2;
        break;
      case "l":
        e2 += r2[0], s2 += r2[1], a2.push({ key: "L", data: [e2, s2] });
        break;
      case "C":
        a2.push({ key: "C", data: [...r2] }), e2 = r2[4], s2 = r2[5];
        break;
      case "c": {
        const t3 = r2.map(((t4, n3) => n3 % 2 ? t4 + s2 : t4 + e2));
        a2.push({ key: "C", data: t3 }), e2 = t3[4], s2 = t3[5];
        break;
      }
      case "Q":
        a2.push({ key: "Q", data: [...r2] }), e2 = r2[2], s2 = r2[3];
        break;
      case "q": {
        const t3 = r2.map(((t4, n3) => n3 % 2 ? t4 + s2 : t4 + e2));
        a2.push({ key: "Q", data: t3 }), e2 = t3[2], s2 = t3[3];
        break;
      }
      case "A":
        a2.push({ key: "A", data: [...r2] }), e2 = r2[5], s2 = r2[6];
        break;
      case "a":
        e2 += r2[5], s2 += r2[6], a2.push({ key: "A", data: [r2[0], r2[1], r2[2], r2[3], r2[4], e2, s2] });
        break;
      case "H":
        a2.push({ key: "H", data: [...r2] }), e2 = r2[0];
        break;
      case "h":
        e2 += r2[0], a2.push({ key: "H", data: [e2] });
        break;
      case "V":
        a2.push({ key: "V", data: [...r2] }), s2 = r2[0];
        break;
      case "v":
        s2 += r2[0], a2.push({ key: "V", data: [s2] });
        break;
      case "S":
        a2.push({ key: "S", data: [...r2] }), e2 = r2[2], s2 = r2[3];
        break;
      case "s": {
        const t3 = r2.map(((t4, n3) => n3 % 2 ? t4 + s2 : t4 + e2));
        a2.push({ key: "S", data: t3 }), e2 = t3[2], s2 = t3[3];
        break;
      }
      case "T":
        a2.push({ key: "T", data: [...r2] }), e2 = r2[0], s2 = r2[1];
        break;
      case "t":
        e2 += r2[0], s2 += r2[1], a2.push({ key: "T", data: [e2, s2] });
        break;
      case "Z":
      case "z":
        a2.push({ key: "Z", data: [] }), e2 = n2, s2 = o2;
    }
    return a2;
  }
  function m(t2) {
    const e2 = [];
    let s2 = "", n2 = 0, o2 = 0, a2 = 0, h2 = 0, r2 = 0, i2 = 0;
    for (const { key: c2, data: l2 } of t2) {
      switch (c2) {
        case "M":
          e2.push({ key: "M", data: [...l2] }), [n2, o2] = l2, [a2, h2] = l2;
          break;
        case "C":
          e2.push({ key: "C", data: [...l2] }), n2 = l2[4], o2 = l2[5], r2 = l2[2], i2 = l2[3];
          break;
        case "L":
          e2.push({ key: "L", data: [...l2] }), [n2, o2] = l2;
          break;
        case "H":
          n2 = l2[0], e2.push({ key: "L", data: [n2, o2] });
          break;
        case "V":
          o2 = l2[0], e2.push({ key: "L", data: [n2, o2] });
          break;
        case "S": {
          let t3 = 0, a3 = 0;
          "C" === s2 || "S" === s2 ? (t3 = n2 + (n2 - r2), a3 = o2 + (o2 - i2)) : (t3 = n2, a3 = o2), e2.push({ key: "C", data: [t3, a3, ...l2] }), r2 = l2[0], i2 = l2[1], n2 = l2[2], o2 = l2[3];
          break;
        }
        case "T": {
          const [t3, a3] = l2;
          let h3 = 0, c3 = 0;
          "Q" === s2 || "T" === s2 ? (h3 = n2 + (n2 - r2), c3 = o2 + (o2 - i2)) : (h3 = n2, c3 = o2);
          const u2 = n2 + 2 * (h3 - n2) / 3, p2 = o2 + 2 * (c3 - o2) / 3, f2 = t3 + 2 * (h3 - t3) / 3, d2 = a3 + 2 * (c3 - a3) / 3;
          e2.push({ key: "C", data: [u2, p2, f2, d2, t3, a3] }), r2 = h3, i2 = c3, n2 = t3, o2 = a3;
          break;
        }
        case "Q": {
          const [t3, s3, a3, h3] = l2, c3 = n2 + 2 * (t3 - n2) / 3, u2 = o2 + 2 * (s3 - o2) / 3, p2 = a3 + 2 * (t3 - a3) / 3, f2 = h3 + 2 * (s3 - h3) / 3;
          e2.push({ key: "C", data: [c3, u2, p2, f2, a3, h3] }), r2 = t3, i2 = s3, n2 = a3, o2 = h3;
          break;
        }
        case "A": {
          const t3 = Math.abs(l2[0]), s3 = Math.abs(l2[1]), a3 = l2[2], h3 = l2[3], r3 = l2[4], i3 = l2[5], c3 = l2[6];
          if (0 === t3 || 0 === s3) e2.push({ key: "C", data: [n2, o2, i3, c3, i3, c3] }), n2 = i3, o2 = c3;
          else if (n2 !== i3 || o2 !== c3) {
            x(n2, o2, i3, c3, t3, s3, a3, h3, r3).forEach((function(t4) {
              e2.push({ key: "C", data: t4 });
            })), n2 = i3, o2 = c3;
          }
          break;
        }
        case "Z":
          e2.push({ key: "Z", data: [] }), n2 = a2, o2 = h2;
      }
      s2 = c2;
    }
    return e2;
  }
  function w(t2, e2, s2) {
    return [t2 * Math.cos(s2) - e2 * Math.sin(s2), t2 * Math.sin(s2) + e2 * Math.cos(s2)];
  }
  function x(t2, e2, s2, n2, o2, a2, h2, r2, i2, c2) {
    const l2 = (u2 = h2, Math.PI * u2 / 180);
    var u2;
    let p2 = [], f2 = 0, d2 = 0, g2 = 0, M2 = 0;
    if (c2) [f2, d2, g2, M2] = c2;
    else {
      [t2, e2] = w(t2, e2, -l2), [s2, n2] = w(s2, n2, -l2);
      const h3 = (t2 - s2) / 2, c3 = (e2 - n2) / 2;
      let u3 = h3 * h3 / (o2 * o2) + c3 * c3 / (a2 * a2);
      u3 > 1 && (u3 = Math.sqrt(u3), o2 *= u3, a2 *= u3);
      const p3 = o2 * o2, k3 = a2 * a2, b3 = p3 * k3 - p3 * c3 * c3 - k3 * h3 * h3, y3 = p3 * c3 * c3 + k3 * h3 * h3, m3 = (r2 === i2 ? -1 : 1) * Math.sqrt(Math.abs(b3 / y3));
      g2 = m3 * o2 * c3 / a2 + (t2 + s2) / 2, M2 = m3 * -a2 * h3 / o2 + (e2 + n2) / 2, f2 = Math.asin(parseFloat(((e2 - M2) / a2).toFixed(9))), d2 = Math.asin(parseFloat(((n2 - M2) / a2).toFixed(9))), t2 < g2 && (f2 = Math.PI - f2), s2 < g2 && (d2 = Math.PI - d2), f2 < 0 && (f2 = 2 * Math.PI + f2), d2 < 0 && (d2 = 2 * Math.PI + d2), i2 && f2 > d2 && (f2 -= 2 * Math.PI), !i2 && d2 > f2 && (d2 -= 2 * Math.PI);
    }
    let k2 = d2 - f2;
    if (Math.abs(k2) > 120 * Math.PI / 180) {
      const t3 = d2, e3 = s2, r3 = n2;
      d2 = i2 && d2 > f2 ? f2 + 120 * Math.PI / 180 * 1 : f2 + 120 * Math.PI / 180 * -1, p2 = x(s2 = g2 + o2 * Math.cos(d2), n2 = M2 + a2 * Math.sin(d2), e3, r3, o2, a2, h2, 0, i2, [d2, t3, g2, M2]);
    }
    k2 = d2 - f2;
    const b2 = Math.cos(f2), y2 = Math.sin(f2), m2 = Math.cos(d2), P2 = Math.sin(d2), v2 = Math.tan(k2 / 4), S2 = 4 / 3 * o2 * v2, O2 = 4 / 3 * a2 * v2, L3 = [t2, e2], T2 = [t2 + S2 * y2, e2 - O2 * b2], D2 = [s2 + S2 * P2, n2 - O2 * m2], A2 = [s2, n2];
    if (T2[0] = 2 * L3[0] - T2[0], T2[1] = 2 * L3[1] - T2[1], c2) return [T2, D2, A2].concat(p2);
    {
      p2 = [T2, D2, A2].concat(p2);
      const t3 = [];
      for (let e3 = 0; e3 < p2.length; e3 += 3) {
        const s3 = w(p2[e3][0], p2[e3][1], l2), n3 = w(p2[e3 + 1][0], p2[e3 + 1][1], l2), o3 = w(p2[e3 + 2][0], p2[e3 + 2][1], l2);
        t3.push([s3[0], s3[1], n3[0], n3[1], o3[0], o3[1]]);
      }
      return t3;
    }
  }
  var P = { randOffset: function(t2, e2) {
    return G(t2, e2);
  }, randOffsetWithRange: function(t2, e2, s2) {
    return E(t2, e2, s2);
  }, ellipse: function(t2, e2, s2, n2, o2) {
    const a2 = T(s2, n2, o2);
    return D(t2, e2, o2, a2).opset;
  }, doubleLineOps: function(t2, e2, s2, n2, o2) {
    return $(t2, e2, s2, n2, o2, true);
  } };
  function v(t2, e2, s2, n2, o2) {
    return { type: "path", ops: $(t2, e2, s2, n2, o2) };
  }
  function S(t2, e2, s2) {
    const n2 = (t2 || []).length;
    if (n2 > 2) {
      const o2 = [];
      for (let e3 = 0; e3 < n2 - 1; e3++) o2.push(...$(t2[e3][0], t2[e3][1], t2[e3 + 1][0], t2[e3 + 1][1], s2));
      return e2 && o2.push(...$(t2[n2 - 1][0], t2[n2 - 1][1], t2[0][0], t2[0][1], s2)), { type: "path", ops: o2 };
    }
    return 2 === n2 ? v(t2[0][0], t2[0][1], t2[1][0], t2[1][1], s2) : { type: "path", ops: [] };
  }
  function O(t2, e2, s2, n2, o2) {
    return (function(t3, e3) {
      return S(t3, true, e3);
    })([[t2, e2], [t2 + s2, e2], [t2 + s2, e2 + n2], [t2, e2 + n2]], o2);
  }
  function L(t2, e2) {
    if (t2.length) {
      const s2 = "number" == typeof t2[0][0] ? [t2] : t2, n2 = j(s2[0], 1 * (1 + 0.2 * e2.roughness), e2), o2 = e2.disableMultiStroke ? [] : j(s2[0], 1.5 * (1 + 0.22 * e2.roughness), z(e2));
      for (let t3 = 1; t3 < s2.length; t3++) {
        const a2 = s2[t3];
        if (a2.length) {
          const t4 = j(a2, 1 * (1 + 0.2 * e2.roughness), e2), s3 = e2.disableMultiStroke ? [] : j(a2, 1.5 * (1 + 0.22 * e2.roughness), z(e2));
          for (const e3 of t4) "move" !== e3.op && n2.push(e3);
          for (const t5 of s3) "move" !== t5.op && o2.push(t5);
        }
      }
      return { type: "path", ops: n2.concat(o2) };
    }
    return { type: "path", ops: [] };
  }
  function T(t2, e2, s2) {
    const n2 = Math.sqrt(2 * Math.PI * Math.sqrt((Math.pow(t2 / 2, 2) + Math.pow(e2 / 2, 2)) / 2)), o2 = Math.ceil(Math.max(s2.curveStepCount, s2.curveStepCount / Math.sqrt(200) * n2)), a2 = 2 * Math.PI / o2;
    let h2 = Math.abs(t2 / 2), r2 = Math.abs(e2 / 2);
    const i2 = 1 - s2.curveFitting;
    return h2 += G(h2 * i2, s2), r2 += G(r2 * i2, s2), { increment: a2, rx: h2, ry: r2 };
  }
  function D(t2, e2, s2, n2) {
    const [o2, a2] = F(n2.increment, t2, e2, n2.rx, n2.ry, 1, n2.increment * E(0.1, E(0.4, 1, s2), s2), s2);
    let h2 = q(o2, null, s2);
    if (!s2.disableMultiStroke && 0 !== s2.roughness) {
      const [o3] = F(n2.increment, t2, e2, n2.rx, n2.ry, 1.5, 0, s2), a3 = q(o3, null, s2);
      h2 = h2.concat(a3);
    }
    return { estimatedPoints: a2, opset: { type: "path", ops: h2 } };
  }
  function A(t2, e2, s2, n2, o2, a2, h2, r2, i2) {
    const c2 = t2, l2 = e2;
    let u2 = Math.abs(s2 / 2), p2 = Math.abs(n2 / 2);
    u2 += G(0.01 * u2, i2), p2 += G(0.01 * p2, i2);
    let f2 = o2, d2 = a2;
    for (; f2 < 0; ) f2 += 2 * Math.PI, d2 += 2 * Math.PI;
    d2 - f2 > 2 * Math.PI && (f2 = 0, d2 = 2 * Math.PI);
    const g2 = 2 * Math.PI / i2.curveStepCount, M2 = Math.min(g2 / 2, (d2 - f2) / 2), k2 = V(M2, c2, l2, u2, p2, f2, d2, 1, i2);
    if (!i2.disableMultiStroke) {
      const t3 = V(M2, c2, l2, u2, p2, f2, d2, 1.5, i2);
      k2.push(...t3);
    }
    return h2 && (r2 ? k2.push(...$(c2, l2, c2 + u2 * Math.cos(f2), l2 + p2 * Math.sin(f2), i2), ...$(c2, l2, c2 + u2 * Math.cos(d2), l2 + p2 * Math.sin(d2), i2)) : k2.push({ op: "lineTo", data: [c2, l2] }, { op: "lineTo", data: [c2 + u2 * Math.cos(f2), l2 + p2 * Math.sin(f2)] })), { type: "path", ops: k2 };
  }
  function _(t2, e2) {
    const s2 = m(y(b(t2))), n2 = [];
    let o2 = [0, 0], a2 = [0, 0];
    for (const { key: t3, data: h2 } of s2) switch (t3) {
      case "M":
        a2 = [h2[0], h2[1]], o2 = [h2[0], h2[1]];
        break;
      case "L":
        n2.push(...$(a2[0], a2[1], h2[0], h2[1], e2)), a2 = [h2[0], h2[1]];
        break;
      case "C": {
        const [t4, s3, o3, r2, i2, c2] = h2;
        n2.push(...Z(t4, s3, o3, r2, i2, c2, a2, e2)), a2 = [i2, c2];
        break;
      }
      case "Z":
        n2.push(...$(a2[0], a2[1], o2[0], o2[1], e2)), a2 = [o2[0], o2[1]];
    }
    return { type: "path", ops: n2 };
  }
  function I(t2, e2) {
    const s2 = [];
    for (const n2 of t2) if (n2.length) {
      const t3 = e2.maxRandomnessOffset || 0, o2 = n2.length;
      if (o2 > 2) {
        s2.push({ op: "move", data: [n2[0][0] + G(t3, e2), n2[0][1] + G(t3, e2)] });
        for (let a2 = 1; a2 < o2; a2++) s2.push({ op: "lineTo", data: [n2[a2][0] + G(t3, e2), n2[a2][1] + G(t3, e2)] });
      }
    }
    return { type: "fillPath", ops: s2 };
  }
  function C(t2, e2) {
    return (function(t3, e3) {
      let s2 = t3.fillStyle || "hachure";
      if (!u[s2]) switch (s2) {
        case "zigzag":
          u[s2] || (u[s2] = new h(e3));
          break;
        case "cross-hatch":
          u[s2] || (u[s2] = new r(e3));
          break;
        case "dots":
          u[s2] || (u[s2] = new i(e3));
          break;
        case "dashed":
          u[s2] || (u[s2] = new c(e3));
          break;
        case "zigzag-line":
          u[s2] || (u[s2] = new l(e3));
          break;
        default:
          s2 = "hachure", u[s2] || (u[s2] = new o(e3));
      }
      return u[s2];
    })(e2, P).fillPolygons(t2, e2);
  }
  function z(t2) {
    const e2 = Object.assign({}, t2);
    return e2.randomizer = void 0, t2.seed && (e2.seed = t2.seed + 1), e2;
  }
  function W(t2) {
    return t2.randomizer || (t2.randomizer = new p(t2.seed || 0)), t2.randomizer.next();
  }
  function E(t2, e2, s2, n2 = 1) {
    return s2.roughness * n2 * (W(s2) * (e2 - t2) + t2);
  }
  function G(t2, e2, s2 = 1) {
    return E(-t2, t2, e2, s2);
  }
  function $(t2, e2, s2, n2, o2, a2 = false) {
    const h2 = a2 ? o2.disableMultiStrokeFill : o2.disableMultiStroke, r2 = R(t2, e2, s2, n2, o2, true, false);
    if (h2) return r2;
    const i2 = R(t2, e2, s2, n2, o2, true, true);
    return r2.concat(i2);
  }
  function R(t2, e2, s2, n2, o2, a2, h2) {
    const r2 = Math.pow(t2 - s2, 2) + Math.pow(e2 - n2, 2), i2 = Math.sqrt(r2);
    let c2 = 1;
    c2 = i2 < 200 ? 1 : i2 > 500 ? 0.4 : -16668e-7 * i2 + 1.233334;
    let l2 = o2.maxRandomnessOffset || 0;
    l2 * l2 * 100 > r2 && (l2 = i2 / 10);
    const u2 = l2 / 2, p2 = 0.2 + 0.2 * W(o2);
    let f2 = o2.bowing * o2.maxRandomnessOffset * (n2 - e2) / 200, d2 = o2.bowing * o2.maxRandomnessOffset * (t2 - s2) / 200;
    f2 = G(f2, o2, c2), d2 = G(d2, o2, c2);
    const g2 = [], M2 = () => G(u2, o2, c2), k2 = () => G(l2, o2, c2), b2 = o2.preserveVertices;
    return a2 && (h2 ? g2.push({ op: "move", data: [t2 + (b2 ? 0 : M2()), e2 + (b2 ? 0 : M2())] }) : g2.push({ op: "move", data: [t2 + (b2 ? 0 : G(l2, o2, c2)), e2 + (b2 ? 0 : G(l2, o2, c2))] })), h2 ? g2.push({ op: "bcurveTo", data: [f2 + t2 + (s2 - t2) * p2 + M2(), d2 + e2 + (n2 - e2) * p2 + M2(), f2 + t2 + 2 * (s2 - t2) * p2 + M2(), d2 + e2 + 2 * (n2 - e2) * p2 + M2(), s2 + (b2 ? 0 : M2()), n2 + (b2 ? 0 : M2())] }) : g2.push({ op: "bcurveTo", data: [f2 + t2 + (s2 - t2) * p2 + k2(), d2 + e2 + (n2 - e2) * p2 + k2(), f2 + t2 + 2 * (s2 - t2) * p2 + k2(), d2 + e2 + 2 * (n2 - e2) * p2 + k2(), s2 + (b2 ? 0 : k2()), n2 + (b2 ? 0 : k2())] }), g2;
  }
  function j(t2, e2, s2) {
    if (!t2.length) return [];
    const n2 = [];
    n2.push([t2[0][0] + G(e2, s2), t2[0][1] + G(e2, s2)]), n2.push([t2[0][0] + G(e2, s2), t2[0][1] + G(e2, s2)]);
    for (let o2 = 1; o2 < t2.length; o2++) n2.push([t2[o2][0] + G(e2, s2), t2[o2][1] + G(e2, s2)]), o2 === t2.length - 1 && n2.push([t2[o2][0] + G(e2, s2), t2[o2][1] + G(e2, s2)]);
    return q(n2, null, s2);
  }
  function q(t2, e2, s2) {
    const n2 = t2.length, o2 = [];
    if (n2 > 3) {
      const a2 = [], h2 = 1 - s2.curveTightness;
      o2.push({ op: "move", data: [t2[1][0], t2[1][1]] });
      for (let e3 = 1; e3 + 2 < n2; e3++) {
        const s3 = t2[e3];
        a2[0] = [s3[0], s3[1]], a2[1] = [s3[0] + (h2 * t2[e3 + 1][0] - h2 * t2[e3 - 1][0]) / 6, s3[1] + (h2 * t2[e3 + 1][1] - h2 * t2[e3 - 1][1]) / 6], a2[2] = [t2[e3 + 1][0] + (h2 * t2[e3][0] - h2 * t2[e3 + 2][0]) / 6, t2[e3 + 1][1] + (h2 * t2[e3][1] - h2 * t2[e3 + 2][1]) / 6], a2[3] = [t2[e3 + 1][0], t2[e3 + 1][1]], o2.push({ op: "bcurveTo", data: [a2[1][0], a2[1][1], a2[2][0], a2[2][1], a2[3][0], a2[3][1]] });
      }
      if (e2 && 2 === e2.length) {
        const t3 = s2.maxRandomnessOffset;
        o2.push({ op: "lineTo", data: [e2[0] + G(t3, s2), e2[1] + G(t3, s2)] });
      }
    } else 3 === n2 ? (o2.push({ op: "move", data: [t2[1][0], t2[1][1]] }), o2.push({ op: "bcurveTo", data: [t2[1][0], t2[1][1], t2[2][0], t2[2][1], t2[2][0], t2[2][1]] })) : 2 === n2 && o2.push(...R(t2[0][0], t2[0][1], t2[1][0], t2[1][1], s2, true, true));
    return o2;
  }
  function F(t2, e2, s2, n2, o2, a2, h2, r2) {
    const i2 = [], c2 = [];
    if (0 === r2.roughness) {
      t2 /= 4, c2.push([e2 + n2 * Math.cos(-t2), s2 + o2 * Math.sin(-t2)]);
      for (let a3 = 0; a3 <= 2 * Math.PI; a3 += t2) {
        const t3 = [e2 + n2 * Math.cos(a3), s2 + o2 * Math.sin(a3)];
        i2.push(t3), c2.push(t3);
      }
      c2.push([e2 + n2 * Math.cos(0), s2 + o2 * Math.sin(0)]), c2.push([e2 + n2 * Math.cos(t2), s2 + o2 * Math.sin(t2)]);
    } else {
      const l2 = G(0.5, r2) - Math.PI / 2;
      c2.push([G(a2, r2) + e2 + 0.9 * n2 * Math.cos(l2 - t2), G(a2, r2) + s2 + 0.9 * o2 * Math.sin(l2 - t2)]);
      const u2 = 2 * Math.PI + l2 - 0.01;
      for (let h3 = l2; h3 < u2; h3 += t2) {
        const t3 = [G(a2, r2) + e2 + n2 * Math.cos(h3), G(a2, r2) + s2 + o2 * Math.sin(h3)];
        i2.push(t3), c2.push(t3);
      }
      c2.push([G(a2, r2) + e2 + n2 * Math.cos(l2 + 2 * Math.PI + 0.5 * h2), G(a2, r2) + s2 + o2 * Math.sin(l2 + 2 * Math.PI + 0.5 * h2)]), c2.push([G(a2, r2) + e2 + 0.98 * n2 * Math.cos(l2 + h2), G(a2, r2) + s2 + 0.98 * o2 * Math.sin(l2 + h2)]), c2.push([G(a2, r2) + e2 + 0.9 * n2 * Math.cos(l2 + 0.5 * h2), G(a2, r2) + s2 + 0.9 * o2 * Math.sin(l2 + 0.5 * h2)]);
    }
    return [c2, i2];
  }
  function V(t2, e2, s2, n2, o2, a2, h2, r2, i2) {
    const c2 = a2 + G(0.1, i2), l2 = [];
    l2.push([G(r2, i2) + e2 + 0.9 * n2 * Math.cos(c2 - t2), G(r2, i2) + s2 + 0.9 * o2 * Math.sin(c2 - t2)]);
    for (let a3 = c2; a3 <= h2; a3 += t2) l2.push([G(r2, i2) + e2 + n2 * Math.cos(a3), G(r2, i2) + s2 + o2 * Math.sin(a3)]);
    return l2.push([e2 + n2 * Math.cos(h2), s2 + o2 * Math.sin(h2)]), l2.push([e2 + n2 * Math.cos(h2), s2 + o2 * Math.sin(h2)]), q(l2, null, i2);
  }
  function Z(t2, e2, s2, n2, o2, a2, h2, r2) {
    const i2 = [], c2 = [r2.maxRandomnessOffset || 1, (r2.maxRandomnessOffset || 1) + 0.3];
    let l2 = [0, 0];
    const u2 = r2.disableMultiStroke ? 1 : 2, p2 = r2.preserveVertices;
    for (let f2 = 0; f2 < u2; f2++) 0 === f2 ? i2.push({ op: "move", data: [h2[0], h2[1]] }) : i2.push({ op: "move", data: [h2[0] + (p2 ? 0 : G(c2[0], r2)), h2[1] + (p2 ? 0 : G(c2[0], r2))] }), l2 = p2 ? [o2, a2] : [o2 + G(c2[f2], r2), a2 + G(c2[f2], r2)], i2.push({ op: "bcurveTo", data: [t2 + G(c2[f2], r2), e2 + G(c2[f2], r2), s2 + G(c2[f2], r2), n2 + G(c2[f2], r2), l2[0], l2[1]] });
    return i2;
  }
  function Q(t2) {
    return [...t2];
  }
  function H(t2, e2 = 0) {
    const s2 = t2.length;
    if (s2 < 3) throw new Error("A curve must have at least three points.");
    const n2 = [];
    if (3 === s2) n2.push(Q(t2[0]), Q(t2[1]), Q(t2[2]), Q(t2[2]));
    else {
      const s3 = [];
      s3.push(t2[0], t2[0]);
      for (let e3 = 1; e3 < t2.length; e3++) s3.push(t2[e3]), e3 === t2.length - 1 && s3.push(t2[e3]);
      const o2 = [], a2 = 1 - e2;
      n2.push(Q(s3[0]));
      for (let t3 = 1; t3 + 2 < s3.length; t3++) {
        const e3 = s3[t3];
        o2[0] = [e3[0], e3[1]], o2[1] = [e3[0] + (a2 * s3[t3 + 1][0] - a2 * s3[t3 - 1][0]) / 6, e3[1] + (a2 * s3[t3 + 1][1] - a2 * s3[t3 - 1][1]) / 6], o2[2] = [s3[t3 + 1][0] + (a2 * s3[t3][0] - a2 * s3[t3 + 2][0]) / 6, s3[t3 + 1][1] + (a2 * s3[t3][1] - a2 * s3[t3 + 2][1]) / 6], o2[3] = [s3[t3 + 1][0], s3[t3 + 1][1]], n2.push(o2[1], o2[2], o2[3]);
      }
    }
    return n2;
  }
  function N(t2, e2) {
    return Math.pow(t2[0] - e2[0], 2) + Math.pow(t2[1] - e2[1], 2);
  }
  function B(t2, e2, s2) {
    const n2 = N(e2, s2);
    if (0 === n2) return N(t2, e2);
    let o2 = ((t2[0] - e2[0]) * (s2[0] - e2[0]) + (t2[1] - e2[1]) * (s2[1] - e2[1])) / n2;
    return o2 = Math.max(0, Math.min(1, o2)), N(t2, J(e2, s2, o2));
  }
  function J(t2, e2, s2) {
    return [t2[0] + (e2[0] - t2[0]) * s2, t2[1] + (e2[1] - t2[1]) * s2];
  }
  function K(t2, e2, s2, n2) {
    const o2 = n2 || [];
    if ((function(t3, e3) {
      const s3 = t3[e3 + 0], n3 = t3[e3 + 1], o3 = t3[e3 + 2], a3 = t3[e3 + 3];
      let h3 = 3 * n3[0] - 2 * s3[0] - a3[0];
      h3 *= h3;
      let r2 = 3 * n3[1] - 2 * s3[1] - a3[1];
      r2 *= r2;
      let i2 = 3 * o3[0] - 2 * a3[0] - s3[0];
      i2 *= i2;
      let c2 = 3 * o3[1] - 2 * a3[1] - s3[1];
      return c2 *= c2, h3 < i2 && (h3 = i2), r2 < c2 && (r2 = c2), h3 + r2;
    })(t2, e2) < s2) {
      const s3 = t2[e2 + 0];
      if (o2.length) {
        (a2 = o2[o2.length - 1], h2 = s3, Math.sqrt(N(a2, h2))) > 1 && o2.push(s3);
      } else o2.push(s3);
      o2.push(t2[e2 + 3]);
    } else {
      const n3 = 0.5, a3 = t2[e2 + 0], h3 = t2[e2 + 1], r2 = t2[e2 + 2], i2 = t2[e2 + 3], c2 = J(a3, h3, n3), l2 = J(h3, r2, n3), u2 = J(r2, i2, n3), p2 = J(c2, l2, n3), f2 = J(l2, u2, n3), d2 = J(p2, f2, n3);
      K([a3, c2, p2, d2], 0, s2, o2), K([d2, f2, u2, i2], 0, s2, o2);
    }
    var a2, h2;
    return o2;
  }
  function U(t2, e2) {
    return X(t2, 0, t2.length, e2);
  }
  function X(t2, e2, s2, n2, o2) {
    const a2 = o2 || [], h2 = t2[e2], r2 = t2[s2 - 1];
    let i2 = 0, c2 = 1;
    for (let n3 = e2 + 1; n3 < s2 - 1; ++n3) {
      const e3 = B(t2[n3], h2, r2);
      e3 > i2 && (i2 = e3, c2 = n3);
    }
    return Math.sqrt(i2) > n2 ? (X(t2, e2, c2 + 1, n2, a2), X(t2, c2, s2, n2, a2)) : (a2.length || a2.push(h2), a2.push(r2)), a2;
  }
  function Y(t2, e2 = 0.15, s2) {
    const n2 = [], o2 = (t2.length - 1) / 3;
    for (let s3 = 0; s3 < o2; s3++) {
      K(t2, 3 * s3, e2, n2);
    }
    return s2 && s2 > 0 ? X(n2, 0, n2.length, s2) : n2;
  }
  var tt = "none";
  var et = class {
    constructor(t2) {
      this.defaultOptions = { maxRandomnessOffset: 2, roughness: 1, bowing: 1, stroke: "#000", strokeWidth: 1, curveTightness: 0, curveFitting: 0.95, curveStepCount: 9, fillStyle: "hachure", fillWeight: -1, hachureAngle: -41, hachureGap: -1, dashOffset: -1, dashGap: -1, zigzagOffset: -1, seed: 0, disableMultiStroke: false, disableMultiStrokeFill: false, preserveVertices: false, fillShapeRoughnessGain: 0.8 }, this.config = t2 || {}, this.config.options && (this.defaultOptions = this._o(this.config.options));
    }
    static newSeed() {
      return Math.floor(Math.random() * 2 ** 31);
    }
    _o(t2) {
      return t2 ? Object.assign({}, this.defaultOptions, t2) : this.defaultOptions;
    }
    _d(t2, e2, s2) {
      return { shape: t2, sets: e2 || [], options: s2 || this.defaultOptions };
    }
    line(t2, e2, s2, n2, o2) {
      const a2 = this._o(o2);
      return this._d("line", [v(t2, e2, s2, n2, a2)], a2);
    }
    rectangle(t2, e2, s2, n2, o2) {
      const a2 = this._o(o2), h2 = [], r2 = O(t2, e2, s2, n2, a2);
      if (a2.fill) {
        const o3 = [[t2, e2], [t2 + s2, e2], [t2 + s2, e2 + n2], [t2, e2 + n2]];
        "solid" === a2.fillStyle ? h2.push(I([o3], a2)) : h2.push(C([o3], a2));
      }
      return a2.stroke !== tt && h2.push(r2), this._d("rectangle", h2, a2);
    }
    ellipse(t2, e2, s2, n2, o2) {
      const a2 = this._o(o2), h2 = [], r2 = T(s2, n2, a2), i2 = D(t2, e2, a2, r2);
      if (a2.fill) if ("solid" === a2.fillStyle) {
        const s3 = D(t2, e2, a2, r2).opset;
        s3.type = "fillPath", h2.push(s3);
      } else h2.push(C([i2.estimatedPoints], a2));
      return a2.stroke !== tt && h2.push(i2.opset), this._d("ellipse", h2, a2);
    }
    circle(t2, e2, s2, n2) {
      const o2 = this.ellipse(t2, e2, s2, s2, n2);
      return o2.shape = "circle", o2;
    }
    linearPath(t2, e2) {
      const s2 = this._o(e2);
      return this._d("linearPath", [S(t2, false, s2)], s2);
    }
    arc(t2, e2, s2, n2, o2, a2, h2 = false, r2) {
      const i2 = this._o(r2), c2 = [], l2 = A(t2, e2, s2, n2, o2, a2, h2, true, i2);
      if (h2 && i2.fill) if ("solid" === i2.fillStyle) {
        const h3 = Object.assign({}, i2);
        h3.disableMultiStroke = true;
        const r3 = A(t2, e2, s2, n2, o2, a2, true, false, h3);
        r3.type = "fillPath", c2.push(r3);
      } else c2.push((function(t3, e3, s3, n3, o3, a3, h3) {
        const r3 = t3, i3 = e3;
        let c3 = Math.abs(s3 / 2), l3 = Math.abs(n3 / 2);
        c3 += G(0.01 * c3, h3), l3 += G(0.01 * l3, h3);
        let u2 = o3, p2 = a3;
        for (; u2 < 0; ) u2 += 2 * Math.PI, p2 += 2 * Math.PI;
        p2 - u2 > 2 * Math.PI && (u2 = 0, p2 = 2 * Math.PI);
        const f2 = (p2 - u2) / h3.curveStepCount, d2 = [];
        for (let t4 = u2; t4 <= p2; t4 += f2) d2.push([r3 + c3 * Math.cos(t4), i3 + l3 * Math.sin(t4)]);
        return d2.push([r3 + c3 * Math.cos(p2), i3 + l3 * Math.sin(p2)]), d2.push([r3, i3]), C([d2], h3);
      })(t2, e2, s2, n2, o2, a2, i2));
      return i2.stroke !== tt && c2.push(l2), this._d("arc", c2, i2);
    }
    curve(t2, e2) {
      const s2 = this._o(e2), n2 = [], o2 = L(t2, s2);
      if (s2.fill && s2.fill !== tt) if ("solid" === s2.fillStyle) {
        const e3 = L(t2, Object.assign(Object.assign({}, s2), { disableMultiStroke: true, roughness: s2.roughness ? s2.roughness + s2.fillShapeRoughnessGain : 0 }));
        n2.push({ type: "fillPath", ops: this._mergedShape(e3.ops) });
      } else {
        const e3 = [], o3 = t2;
        if (o3.length) {
          const t3 = "number" == typeof o3[0][0] ? [o3] : o3;
          for (const n3 of t3) n3.length < 3 ? e3.push(...n3) : 3 === n3.length ? e3.push(...Y(H([n3[0], n3[0], n3[1], n3[2]]), 10, (1 + s2.roughness) / 2)) : e3.push(...Y(H(n3), 10, (1 + s2.roughness) / 2));
        }
        e3.length && n2.push(C([e3], s2));
      }
      return s2.stroke !== tt && n2.push(o2), this._d("curve", n2, s2);
    }
    polygon(t2, e2) {
      const s2 = this._o(e2), n2 = [], o2 = S(t2, true, s2);
      return s2.fill && ("solid" === s2.fillStyle ? n2.push(I([t2], s2)) : n2.push(C([t2], s2))), s2.stroke !== tt && n2.push(o2), this._d("polygon", n2, s2);
    }
    path(t2, e2) {
      const s2 = this._o(e2), n2 = [];
      if (!t2) return this._d("path", n2, s2);
      t2 = (t2 || "").replace(/\n/g, " ").replace(/(-\s)/g, "-").replace("/(ss)/g", " ");
      const o2 = s2.fill && "transparent" !== s2.fill && s2.fill !== tt, a2 = s2.stroke !== tt, h2 = !!(s2.simplification && s2.simplification < 1), r2 = (function(t3, e3, s3) {
        const n3 = m(y(b(t3))), o3 = [];
        let a3 = [], h3 = [0, 0], r3 = [];
        const i3 = () => {
          r3.length >= 4 && a3.push(...Y(r3, e3)), r3 = [];
        }, c2 = () => {
          i3(), a3.length && (o3.push(a3), a3 = []);
        };
        for (const { key: t4, data: e4 } of n3) switch (t4) {
          case "M":
            c2(), h3 = [e4[0], e4[1]], a3.push(h3);
            break;
          case "L":
            i3(), a3.push([e4[0], e4[1]]);
            break;
          case "C":
            if (!r3.length) {
              const t5 = a3.length ? a3[a3.length - 1] : h3;
              r3.push([t5[0], t5[1]]);
            }
            r3.push([e4[0], e4[1]]), r3.push([e4[2], e4[3]]), r3.push([e4[4], e4[5]]);
            break;
          case "Z":
            i3(), a3.push([h3[0], h3[1]]);
        }
        if (c2(), !s3) return o3;
        const l2 = [];
        for (const t4 of o3) {
          const e4 = U(t4, s3);
          e4.length && l2.push(e4);
        }
        return l2;
      })(t2, 1, h2 ? 4 - 4 * (s2.simplification || 1) : (1 + s2.roughness) / 2), i2 = _(t2, s2);
      if (o2) if ("solid" === s2.fillStyle) if (1 === r2.length) {
        const e3 = _(t2, Object.assign(Object.assign({}, s2), { disableMultiStroke: true, roughness: s2.roughness ? s2.roughness + s2.fillShapeRoughnessGain : 0 }));
        n2.push({ type: "fillPath", ops: this._mergedShape(e3.ops) });
      } else n2.push(I(r2, s2));
      else n2.push(C(r2, s2));
      return a2 && (h2 ? r2.forEach(((t3) => {
        n2.push(S(t3, false, s2));
      })) : n2.push(i2)), this._d("path", n2, s2);
    }
    opsToPath(t2, e2) {
      let s2 = "";
      for (const n2 of t2.ops) {
        const t3 = "number" == typeof e2 && e2 >= 0 ? n2.data.map(((t4) => +t4.toFixed(e2))) : n2.data;
        switch (n2.op) {
          case "move":
            s2 += `M${t3[0]} ${t3[1]} `;
            break;
          case "bcurveTo":
            s2 += `C${t3[0]} ${t3[1]}, ${t3[2]} ${t3[3]}, ${t3[4]} ${t3[5]} `;
            break;
          case "lineTo":
            s2 += `L${t3[0]} ${t3[1]} `;
        }
      }
      return s2.trim();
    }
    toPaths(t2) {
      const e2 = t2.sets || [], s2 = t2.options || this.defaultOptions, n2 = [];
      for (const t3 of e2) {
        let e3 = null;
        switch (t3.type) {
          case "path":
            e3 = { d: this.opsToPath(t3), stroke: s2.stroke, strokeWidth: s2.strokeWidth, fill: tt };
            break;
          case "fillPath":
            e3 = { d: this.opsToPath(t3), stroke: tt, strokeWidth: 0, fill: s2.fill || tt };
            break;
          case "fillSketch":
            e3 = this.fillSketch(t3, s2);
        }
        e3 && n2.push(e3);
      }
      return n2;
    }
    fillSketch(t2, e2) {
      let s2 = e2.fillWeight;
      return s2 < 0 && (s2 = e2.strokeWidth / 2), { d: this.opsToPath(t2), stroke: e2.fill || tt, strokeWidth: s2, fill: tt };
    }
    _mergedShape(t2) {
      return t2.filter(((t3, e2) => 0 === e2 || "move" !== t3.op));
    }
  };
  var st = class {
    constructor(t2, e2) {
      this.canvas = t2, this.ctx = this.canvas.getContext("2d"), this.gen = new et(e2);
    }
    draw(t2) {
      const e2 = t2.sets || [], s2 = t2.options || this.getDefaultOptions(), n2 = this.ctx, o2 = t2.options.fixedDecimalPlaceDigits;
      for (const a2 of e2) switch (a2.type) {
        case "path":
          n2.save(), n2.strokeStyle = "none" === s2.stroke ? "transparent" : s2.stroke, n2.lineWidth = s2.strokeWidth, s2.strokeLineDash && n2.setLineDash(s2.strokeLineDash), s2.strokeLineDashOffset && (n2.lineDashOffset = s2.strokeLineDashOffset), this._drawToContext(n2, a2, o2), n2.restore();
          break;
        case "fillPath": {
          n2.save(), n2.fillStyle = s2.fill || "";
          const e3 = "curve" === t2.shape || "polygon" === t2.shape || "path" === t2.shape ? "evenodd" : "nonzero";
          this._drawToContext(n2, a2, o2, e3), n2.restore();
          break;
        }
        case "fillSketch":
          this.fillSketch(n2, a2, s2);
      }
    }
    fillSketch(t2, e2, s2) {
      let n2 = s2.fillWeight;
      n2 < 0 && (n2 = s2.strokeWidth / 2), t2.save(), s2.fillLineDash && t2.setLineDash(s2.fillLineDash), s2.fillLineDashOffset && (t2.lineDashOffset = s2.fillLineDashOffset), t2.strokeStyle = s2.fill || "", t2.lineWidth = n2, this._drawToContext(t2, e2, s2.fixedDecimalPlaceDigits), t2.restore();
    }
    _drawToContext(t2, e2, s2, n2 = "nonzero") {
      t2.beginPath();
      for (const n3 of e2.ops) {
        const e3 = "number" == typeof s2 && s2 >= 0 ? n3.data.map(((t3) => +t3.toFixed(s2))) : n3.data;
        switch (n3.op) {
          case "move":
            t2.moveTo(e3[0], e3[1]);
            break;
          case "bcurveTo":
            t2.bezierCurveTo(e3[0], e3[1], e3[2], e3[3], e3[4], e3[5]);
            break;
          case "lineTo":
            t2.lineTo(e3[0], e3[1]);
        }
      }
      "fillPath" === e2.type ? t2.fill(n2) : t2.stroke();
    }
    get generator() {
      return this.gen;
    }
    getDefaultOptions() {
      return this.gen.defaultOptions;
    }
    line(t2, e2, s2, n2, o2) {
      const a2 = this.gen.line(t2, e2, s2, n2, o2);
      return this.draw(a2), a2;
    }
    rectangle(t2, e2, s2, n2, o2) {
      const a2 = this.gen.rectangle(t2, e2, s2, n2, o2);
      return this.draw(a2), a2;
    }
    ellipse(t2, e2, s2, n2, o2) {
      const a2 = this.gen.ellipse(t2, e2, s2, n2, o2);
      return this.draw(a2), a2;
    }
    circle(t2, e2, s2, n2) {
      const o2 = this.gen.circle(t2, e2, s2, n2);
      return this.draw(o2), o2;
    }
    linearPath(t2, e2) {
      const s2 = this.gen.linearPath(t2, e2);
      return this.draw(s2), s2;
    }
    polygon(t2, e2) {
      const s2 = this.gen.polygon(t2, e2);
      return this.draw(s2), s2;
    }
    arc(t2, e2, s2, n2, o2, a2, h2 = false, r2) {
      const i2 = this.gen.arc(t2, e2, s2, n2, o2, a2, h2, r2);
      return this.draw(i2), i2;
    }
    curve(t2, e2) {
      const s2 = this.gen.curve(t2, e2);
      return this.draw(s2), s2;
    }
    path(t2, e2) {
      const s2 = this.gen.path(t2, e2);
      return this.draw(s2), s2;
    }
  };
  var nt = "http://www.w3.org/2000/svg";
  var ot = class {
    constructor(t2, e2) {
      this.svg = t2, this.gen = new et(e2);
    }
    draw(t2) {
      const e2 = t2.sets || [], s2 = t2.options || this.getDefaultOptions(), n2 = this.svg.ownerDocument || window.document, o2 = n2.createElementNS(nt, "g"), a2 = t2.options.fixedDecimalPlaceDigits;
      for (const h2 of e2) {
        let e3 = null;
        switch (h2.type) {
          case "path":
            e3 = n2.createElementNS(nt, "path"), e3.setAttribute("d", this.opsToPath(h2, a2)), e3.setAttribute("stroke", s2.stroke), e3.setAttribute("stroke-width", s2.strokeWidth + ""), e3.setAttribute("fill", "none"), s2.strokeLineDash && e3.setAttribute("stroke-dasharray", s2.strokeLineDash.join(" ").trim()), s2.strokeLineDashOffset && e3.setAttribute("stroke-dashoffset", `${s2.strokeLineDashOffset}`);
            break;
          case "fillPath":
            e3 = n2.createElementNS(nt, "path"), e3.setAttribute("d", this.opsToPath(h2, a2)), e3.setAttribute("stroke", "none"), e3.setAttribute("stroke-width", "0"), e3.setAttribute("fill", s2.fill || ""), "curve" !== t2.shape && "polygon" !== t2.shape || e3.setAttribute("fill-rule", "evenodd");
            break;
          case "fillSketch":
            e3 = this.fillSketch(n2, h2, s2);
        }
        e3 && o2.appendChild(e3);
      }
      return o2;
    }
    fillSketch(t2, e2, s2) {
      let n2 = s2.fillWeight;
      n2 < 0 && (n2 = s2.strokeWidth / 2);
      const o2 = t2.createElementNS(nt, "path");
      return o2.setAttribute("d", this.opsToPath(e2, s2.fixedDecimalPlaceDigits)), o2.setAttribute("stroke", s2.fill || ""), o2.setAttribute("stroke-width", n2 + ""), o2.setAttribute("fill", "none"), s2.fillLineDash && o2.setAttribute("stroke-dasharray", s2.fillLineDash.join(" ").trim()), s2.fillLineDashOffset && o2.setAttribute("stroke-dashoffset", `${s2.fillLineDashOffset}`), o2;
    }
    get generator() {
      return this.gen;
    }
    getDefaultOptions() {
      return this.gen.defaultOptions;
    }
    opsToPath(t2, e2) {
      return this.gen.opsToPath(t2, e2);
    }
    line(t2, e2, s2, n2, o2) {
      const a2 = this.gen.line(t2, e2, s2, n2, o2);
      return this.draw(a2);
    }
    rectangle(t2, e2, s2, n2, o2) {
      const a2 = this.gen.rectangle(t2, e2, s2, n2, o2);
      return this.draw(a2);
    }
    ellipse(t2, e2, s2, n2, o2) {
      const a2 = this.gen.ellipse(t2, e2, s2, n2, o2);
      return this.draw(a2);
    }
    circle(t2, e2, s2, n2) {
      const o2 = this.gen.circle(t2, e2, s2, n2);
      return this.draw(o2);
    }
    linearPath(t2, e2) {
      const s2 = this.gen.linearPath(t2, e2);
      return this.draw(s2);
    }
    polygon(t2, e2) {
      const s2 = this.gen.polygon(t2, e2);
      return this.draw(s2);
    }
    arc(t2, e2, s2, n2, o2, a2, h2 = false, r2) {
      const i2 = this.gen.arc(t2, e2, s2, n2, o2, a2, h2, r2);
      return this.draw(i2);
    }
    curve(t2, e2) {
      const s2 = this.gen.curve(t2, e2);
      return this.draw(s2);
    }
    path(t2, e2) {
      const s2 = this.gen.path(t2, e2);
      return this.draw(s2);
    }
  };
  var at = { canvas: (t2, e2) => new st(t2, e2), svg: (t2, e2) => new ot(t2, e2), generator: (t2) => new et(t2), newSeed: () => et.newSeed() };

  // src/scene.js
  var { Application, Container, Graphics, Sprite, Texture } = window.PIXI;
  var W2 = 1280;
  var H2 = 720;
  var C2 = {
    slate: 1779243,
    slateDot: 2503995,
    newsprint: 14475481,
    fiber: 16053744,
    ink: 2503222,
    teal: 6852231,
    copper: 12155484,
    shadow: 725268
  };
  function mulberry32(a2) {
    return function() {
      a2 |= 0;
      a2 = a2 + 1831565813 | 0;
      let t2 = Math.imul(a2 ^ a2 >>> 15, 1 | a2);
      t2 = t2 + Math.imul(t2 ^ t2 >>> 7, 61 | t2) ^ t2;
      return ((t2 ^ t2 >>> 14) >>> 0) / 4294967296;
    };
  }
  var clamp = (v2, a2 = 0, b2 = 1) => Math.min(b2, Math.max(a2, v2));
  var lerp = (a2, b2, p2) => a2 + (b2 - a2) * p2;
  var EASE = {};
  function seg(t2, start, dur, ease) {
    const p2 = clamp((t2 - start) / dur);
    return ease ? EASE[ease](p2) : p2;
  }
  function tearEdge() {
    const r2 = mulberry32(107);
    const pts = [];
    for (let y2 = -12; y2 <= H2 + 12; y2 += 14) {
      const base = 612 - y2 / H2 * 22;
      pts.push([base + (r2() - 0.5) * 18 + Math.sin(y2 * 0.031) * 7, y2]);
    }
    return pts;
  }
  function paperCanvas() {
    const cv = document.createElement("canvas");
    cv.width = W2;
    cv.height = H2;
    const g2 = cv.getContext("2d");
    g2.fillStyle = "#DCE0D9";
    g2.fillRect(0, 0, W2, H2);
    const r2 = mulberry32(31);
    for (let i2 = 0; i2 < 9e3; i2++) {
      const v2 = r2();
      g2.fillStyle = v2 > 0.5 ? "rgba(38,50,54,0.07)" : "rgba(255,255,255,0.22)";
      g2.fillRect(r2() * W2, r2() * H2, 1 + r2() * 1.6, 1 + r2() * 1.6);
    }
    g2.strokeStyle = "rgba(38,50,54,0.06)";
    g2.lineWidth = 1;
    for (let i2 = 0; i2 < 260; i2++) {
      const x2 = r2() * W2, y2 = r2() * H2, a2 = r2() * Math.PI, l2 = 6 + r2() * 16;
      g2.beginPath();
      g2.moveTo(x2, y2);
      g2.lineTo(x2 + Math.cos(a2) * l2, y2 + Math.sin(a2) * l2);
      g2.stroke();
    }
    g2.fillStyle = "rgba(38,50,54,0.075)";
    for (let y2 = 27; y2 < H2; y2 += 28) g2.fillRect(0, y2, W2, 1);
    return cv;
  }
  function slateCanvas() {
    const cv = document.createElement("canvas");
    cv.width = W2;
    cv.height = H2;
    const g2 = cv.getContext("2d");
    g2.fillStyle = "#1B262B";
    g2.fillRect(0, 0, W2, H2);
    g2.fillStyle = "#26353B";
    for (let y2 = 4; y2 < H2; y2 += 8) for (let x2 = y2 / 8 % 2 ? 4 : 0; x2 < W2; x2 += 8) {
      g2.beginPath();
      g2.arc(x2, y2, 1.25, 0, Math.PI * 2);
      g2.fill();
    }
    const r2 = mulberry32(77);
    g2.fillStyle = "rgba(220,224,217,0.05)";
    for (let i2 = 0; i2 < 1400; i2++) g2.fillRect(r2() * W2, r2() * H2, 1, 1);
    const vg = g2.createRadialGradient(W2 * 0.7, H2 * 0.45, 120, W2 * 0.7, H2 * 0.45, 900);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.35)");
    g2.fillStyle = vg;
    g2.fillRect(0, 0, W2, H2);
    return cv;
  }
  function flatten(drawable, ox, oy, s2) {
    const strokes = [];
    for (const set of drawable.sets) {
      if (set.type !== "path") continue;
      let cur = null, pts = null;
      for (const op of set.ops) {
        const d2 = op.data;
        if (op.op === "move") {
          if (pts && pts.length > 1) strokes.push(pts);
          cur = [d2[0], d2[1]];
          pts = [cur];
        } else if (op.op === "lineTo") {
          cur = [d2[0], d2[1]];
          pts.push(cur);
        } else if (op.op === "bcurveTo") {
          const [x0, y0] = cur;
          for (let k2 = 1; k2 <= 8; k2++) {
            const u2 = k2 / 8, m2 = 1 - u2;
            pts.push([
              m2 * m2 * m2 * x0 + 3 * m2 * m2 * u2 * d2[0] + 3 * m2 * u2 * u2 * d2[2] + u2 * u2 * u2 * d2[4],
              m2 * m2 * m2 * y0 + 3 * m2 * m2 * u2 * d2[1] + 3 * m2 * u2 * u2 * d2[3] + u2 * u2 * u2 * d2[5]
            ]);
          }
          cur = [d2[4], d2[5]];
        }
      }
      if (pts && pts.length > 1) strokes.push(pts);
    }
    return strokes.map((p2) => {
      const q2 = p2.map(([x2, y2]) => [ox + x2 * s2, oy + y2 * s2]);
      let L3 = 0;
      const acc = [0];
      for (let i2 = 1; i2 < q2.length; i2++) {
        L3 += Math.hypot(q2[i2][0] - q2[i2 - 1][0], q2[i2][1] - q2[i2 - 1][1]);
        acc.push(L3);
      }
      return { pts: q2, acc, L: L3 };
    });
  }
  function drawPartial(g2, strokes, p2, style) {
    const total = strokes.reduce((a2, s2) => a2 + s2.L, 0);
    let budget = total * clamp(p2);
    for (const s2 of strokes) {
      if (budget <= 0) break;
      const lim = Math.min(budget, s2.L);
      budget -= s2.L;
      g2.moveTo(s2.pts[0][0], s2.pts[0][1]);
      for (let i2 = 1; i2 < s2.pts.length; i2++) {
        if (s2.acc[i2] <= lim) g2.lineTo(s2.pts[i2][0], s2.pts[i2][1]);
        else {
          const a2 = s2.acc[i2 - 1], f2 = (lim - a2) / Math.max(1e-6, s2.acc[i2] - a2);
          g2.lineTo(lerp(s2.pts[i2 - 1][0], s2.pts[i2][0], f2), lerp(s2.pts[i2 - 1][1], s2.pts[i2][1], f2));
          break;
        }
      }
    }
    g2.stroke(style);
  }
  function cubicPartial(g2, c2, p2) {
    const [x0, y0, x1, y1, x2, y2, x3, y3] = c2;
    const n2 = 40, end = clamp(p2);
    g2.moveTo(x0, y0);
    for (let k2 = 1; k2 <= n2; k2++) {
      const u2 = k2 / n2 * end, m2 = 1 - u2;
      g2.lineTo(
        m2 * m2 * m2 * x0 + 3 * m2 * m2 * u2 * x1 + 3 * m2 * u2 * u2 * x2 + u2 * u2 * u2 * x3,
        m2 * m2 * m2 * y0 + 3 * m2 * m2 * u2 * y1 + 3 * m2 * u2 * u2 * y2 + u2 * u2 * u2 * y3
      );
    }
  }
  var PIN0 = [478, 380];
  var NODES = [
    { id: "A", poly: [[760, 240], [840, 226], [870, 258], [800, 300]], fill: C2.teal, echo: C2.copper, pin: [800, 262], at: 1.3, rot0: -0.22 },
    { id: "B", poly: [[1042, 186], [1162, 196], [1155, 286], [1035, 276]], fill: C2.copper, echo: C2.teal, pin: [1100, 236], at: 1.42, rot0: 0.2 },
    { id: "D", poly: [[880, 470], [960, 456], [972, 520], [892, 530]], fill: C2.teal, echo: C2.copper, pin: [930, 492], at: 1.52, rot0: 0.18 },
    { id: "C", poly: [[1e3, 420], [1090, 404], [1110, 470], [1020, 486]], fill: C2.teal, echo: C2.copper, pin: [1055, 446], at: 1.62, rot0: -0.16 }
  ];
  var THREADS = [
    { c: [478, 380, 580, 330, 650, 300, 800, 262], at: 1.5, dur: 0.38, pin: "A" },
    { c: [800, 262, 880, 300, 1e3, 260, 1100, 236], at: 1.84, dur: 0.26, pin: "B" },
    { c: [800, 262, 860, 420, 900, 470, 930, 492], at: 1.9, dur: 0.26, pin: "D" },
    { c: [930, 492, 980, 470, 1020, 460, 1055, 446], at: 2.12, dur: 0.16, pin: "C" },
    { c: [1100, 236, 1110, 320, 1080, 380, 1055, 446], at: 2.12, dur: 0.2, pin: "C" }
  ];
  var DISC = { x: 930, y: 352, r: 190 };
  var app;
  var L2 = {};
  var data = {};
  var ready = null;
  function init(gsapRef) {
    if (ready) return ready;
    EASE = {
      in2: gsapRef.parseEase("power2.in"),
      out2: gsapRef.parseEase("power2.out"),
      io2: gsapRef.parseEase("power2.inOut"),
      back: gsapRef.parseEase("back.out(1.6)"),
      sine: gsapRef.parseEase("sine.inOut")
    };
    ready = (async () => {
      const a2 = new Application();
      await a2.init({
        width: W2,
        height: H2,
        background: C2.slate,
        antialias: true,
        autoStart: false,
        sharedTicker: false,
        preference: "webgl",
        preserveDrawingBuffer: true,
        resolution: 1
      });
      a2.ticker.stop();
      const host = document.getElementById("stage");
      a2.canvas.style.width = "100%";
      a2.canvas.style.height = "100%";
      host.appendChild(a2.canvas);
      const paperTex = Texture.from(paperCanvas());
      const slateTex = Texture.from(slateCanvas());
      const edge = tearEdge();
      data.edge = edge;
      a2.stage.addChild(new Sprite(slateTex));
      L2.disc = new Graphics();
      L2.guide = new Graphics();
      a2.stage.addChild(L2.disc, L2.guide);
      L2.nodes = NODES.map((n2) => {
        const cx = n2.poly.reduce((a3, p2) => a3 + p2[0], 0) / 4, cy = n2.poly.reduce((a3, p2) => a3 + p2[1], 0) / 4;
        const local = n2.poly.flatMap(([x2, y2]) => [x2 - cx, y2 - cy]);
        const ct = new Container();
        ct.position.set(cx, cy);
        const shadow = new Graphics().poly(local.map((v2, i2) => v2 + (i2 % 2 ? 9 : 7))).fill({ color: C2.shadow, alpha: 0.45 });
        const echo1 = new Graphics().poly(local).fill({ color: n2.echo, alpha: 0.85 });
        const echo2 = new Graphics().poly(local).fill({ color: n2.echo, alpha: 0.5 });
        const body = new Graphics().poly(local).fill({ color: n2.fill });
        const gen2 = at.generator();
        const dr = gen2.polygon(n2.poly.map(([x2, y2]) => [x2 - cx, y2 - cy]), { seed: 11 + cx | 0, roughness: 1.1, bowing: 0.8 });
        const outline = new Graphics();
        drawPartial(outline, flatten(dr, 0, 0, 1), 1, { width: 1.6, color: C2.newsprint, alpha: 0.75 });
        ct.addChild(shadow, echo2, echo1, body, outline);
        a2.stage.addChild(ct);
        return { ct, echo1, echo2, cx, cy };
      });
      L2.thread = new Graphics();
      L2.pins = new Graphics();
      const remPoly = [[-20, -20], ...edge, [-20, H2 + 20]];
      const remShadow = new Graphics().poly(remPoly.flatMap(([x2, y2]) => [x2 + 10, y2 + 12])).fill({ color: C2.shadow, alpha: 0.5 });
      const remFiber = new Graphics().poly([[-20, -20], ...edge.map(([x2, y2], i2) => [x2 + 4 + i2 * 7 % 5, y2]), [-20, H2 + 20]].flat()).fill({ color: C2.fiber });
      const remMask = new Graphics().poly(remPoly.flat()).fill({ color: 16777215 });
      const remPaper = new Sprite(paperTex);
      remPaper.mask = remMask;
      L2.remnant = new Container();
      L2.remnant.addChild(remShadow, remFiber, remPaper, remMask);
      const tape = new Graphics().poly([0, 0, 92, 0, 88, 24, 4, 26]).fill({ color: C2.copper, alpha: 0.55 });
      tape.position.set(230, 206);
      tape.rotation = -0.1;
      const tape2 = new Graphics().poly([0, 0, 80, 0, 77, 22, 3, 24]).fill({ color: C2.copper, alpha: 0.5 });
      tape2.position.set(548, 360);
      tape2.rotation = 0.22;
      L2.remnant.addChild(tape, tape2);
      const gen = at.generator();
      const bulb = gen.path("M45 0C-10 0 -20 80 22 110L26 150H66L70 110C112 80 102 0 45 0Z", { seed: 7, roughness: 1.3, bowing: 1.2 });
      const base1 = gen.line(30, 170, 62, 170, { seed: 8, roughness: 1 });
      const base2 = gen.line(34, 186, 58, 186, { seed: 9, roughness: 1 });
      const fil = gen.linearPath([[38, 60], [46, 88], [54, 60]], { seed: 10, roughness: 0.8 });
      const ox = 290 - 45 * 1.45, oy = 238;
      data.bulb = [...flatten(bulb, ox, oy, 1.45), ...flatten(base1, ox, oy, 1.45), ...flatten(base2, ox, oy, 1.45)];
      data.fil = flatten(fil, ox, oy, 1.45);
      L2.sketch = new Graphics();
      L2.filament = new Graphics();
      L2.remnant.addChild(L2.sketch, L2.filament);
      a2.stage.addChild(L2.remnant);
      a2.stage.addChild(L2.thread, L2.pins);
      const piecePoly = [...edge, [W2 + 40, H2 + 20], [W2 + 40, -20]];
      L2.piece = new Container();
      L2.pieceShadow = new Graphics().poly(piecePoly.flatMap(([x2, y2]) => [x2 + 14, y2 + 18])).fill({ color: C2.shadow, alpha: 1 });
      const pFiber = new Graphics().poly([...edge.map(([x2, y2], i2) => [x2 - 4 - i2 * 5 % 4, y2]), [W2 + 40, H2 + 20], [W2 + 40, -20]].flat()).fill({ color: C2.fiber });
      const pMask = new Graphics().poly(piecePoly.flat()).fill({ color: 16777215 });
      const pPaper = new Sprite(paperTex);
      pPaper.mask = pMask;
      L2.piece.addChild(L2.pieceShadow, pFiber, pPaper, pMask);
      L2.piece.pivot.set(W2, 0);
      L2.piece.position.set(W2, 0);
      a2.stage.addChild(L2.piece);
      app = a2;
    })().catch((err) => {
      app = null;
      console.error("[style-107] Pixi scene init failed:", err);
    });
    return ready;
  }
  function render(t2) {
    if (!app) return;
    L2.sketch.clear();
    drawPartial(L2.sketch, data.bulb, seg(t2, 0.15, 0.7, "io2"), { width: 2.6, color: C2.ink, cap: "round", join: "round" });
    L2.filament.clear();
    drawPartial(L2.filament, data.fil, seg(t2, 0.68, 0.22, "out2"), { width: 3, color: C2.copper, cap: "round" });
    const lift = seg(t2, 0.78, 0.24, "sine");
    const tear = seg(t2, 1, 0.48, "in2");
    L2.piece.rotation = 0.035 * lift + 0.46 * tear;
    L2.piece.position.set(W2 + 14 * lift + 1180 * tear, -8 * lift - 260 * tear);
    L2.pieceShadow.alpha = 0.5 * Math.max(lift, tear > 0 ? 1 : 0);
    L2.piece.visible = tear < 1;
    const sweep = seg(t2, 1.12, 0.55, "io2");
    L2.disc.clear();
    if (sweep > 0) {
      const A2 = sweep * Math.PI * 2;
      for (let y2 = DISC.y - DISC.r; y2 <= DISC.y + DISC.r; y2 += 12) {
        for (let x2 = DISC.x - DISC.r; x2 <= DISC.x + DISC.r; x2 += 12) {
          const dx = x2 - DISC.x, dy = y2 - DISC.y, d2 = Math.hypot(dx, dy);
          if (d2 > DISC.r) continue;
          let ang = Math.atan2(dx, -dy);
          if (ang < 0) ang += Math.PI * 2;
          if (ang > A2) continue;
          const lum = 1 - Math.pow(d2 / DISC.r, 2) * 0.55 + 0.12 * Math.sin(dx * 0.03 + dy * 0.02);
          const grow = clamp((A2 - ang) / 0.5);
          const rr = 3.6 * clamp(lum, 0.25, 1) * grow;
          if (rr > 0.2) L2.disc.circle(x2, y2, rr);
        }
      }
      L2.disc.fill({ color: C2.teal });
    }
    const gIn = seg(t2, 1.1, 0.25), gOut = seg(t2, 1.85, 0.4, "out2");
    L2.guide.clear();
    const ga = gIn * (1 - gOut);
    if (ga > 0) {
      const rot = (t2 - 1.1) * 0.9, R2 = DISC.r + 24 + 30 * gOut;
      for (let k2 = 0; k2 < 48; k2++) {
        const a0 = rot + k2 / 48 * Math.PI * 2, a1 = a0 + 0.07;
        L2.guide.moveTo(DISC.x + Math.sin(a0) * R2, DISC.y - Math.cos(a0) * R2).lineTo(DISC.x + Math.sin(a1) * R2, DISC.y - Math.cos(a1) * R2);
      }
      L2.guide.stroke({ width: 2, color: C2.newsprint, alpha: 0.55 * ga });
    }
    NODES.forEach((n2, i2) => {
      const o2 = L2.nodes[i2];
      const p2 = seg(t2, n2.at, 0.42, "back");
      const pl = seg(t2, n2.at, 0.42);
      o2.ct.visible = pl > 0;
      o2.ct.alpha = clamp(pl * 4);
      o2.ct.scale.set(lerp(1.35, 1, p2));
      o2.ct.rotation = n2.rot0 * (1 - p2);
      const off = 4 + 22 * (1 - pl);
      o2.echo1.position.set(off, off * 0.6);
      o2.echo2.position.set(off * 2, off * 1.2);
    });
    L2.thread.clear();
    L2.pins.clear();
    const pinScale = {};
    const pin0 = seg(t2, 1.42, 0.12, "back");
    THREADS.forEach((th) => {
      const p2 = seg(t2, th.at, th.dur, "io2");
      if (p2 <= 0) return;
      cubicPartial(L2.thread, th.c, p2);
      L2.thread.stroke({ width: 3, color: C2.copper, cap: "round" });
      if (p2 >= 1) pinScale[th.pin] = Math.max(pinScale[th.pin] || 0, seg(t2, th.at + th.dur, 0.14, "back"));
    });
    const pinAt = (x2, y2, s2) => {
      if (s2 <= 0) return;
      L2.pins.circle(x2, y2, 10 * s2).fill({ color: C2.newsprint });
      L2.pins.circle(x2, y2, 7 * s2).fill({ color: C2.copper });
    };
    pinAt(PIN0[0], PIN0[1], pin0);
    NODES.forEach((n2) => pinAt(n2.pin[0], n2.pin[1], pinScale[n2.id] || 0));
    app.render();
  }
  function whenReady() {
    return ready;
  }
  return __toCommonJS(scene_exports);
})();
