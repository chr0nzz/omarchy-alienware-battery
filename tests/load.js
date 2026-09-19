const fs = require("node:fs")
const path = require("node:path")

function load(name) {
  const src = fs.readFileSync(path.join(__dirname, "..", name), "utf8")
    .split("\n")
    .filter(function(line) { return !/^\.(pragma|import)\b/.test(line) })
    .join("\n")
  const names = Array.from(src.matchAll(/^(?:function|var) (\w+)/gm), function(m) { return m[1] })
  return new Function(src + "\nreturn { " + names.join(", ") + " }")()
}

module.exports = { Model: load("Model.js") }
