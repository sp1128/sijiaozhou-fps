// Assembles 四角洲国产3A大作_V2.html from the page shell + the edited (re-minified) bundle + extra CSS.
//   shell.html        — the page around the game: markup and base styles, with a /*@jm-bundle*/ slot for the script
//   bundle.pretty.js  — the game (beautified bundle, source of truth)
//   net.js            — multiplayer module, injected at the /*@jm-net*/ marker inside the bundle's IIFE
//   extra.css         — extra styles appended to the shell's <style>
// Output: ../四角洲国产3A大作_V2.html, ../game_v2.html and ../server/public/index.html (what the room server serves).
const fs = require('fs'), path = require('path'), cp = require('child_process');
const here = __dirname, root = path.join(here, '..');
const SLOT = '/*@jm-bundle*/', MARK = '/*@jm-net*/';
const one = (text, mark, file) => { if (text.split(mark).length !== 2) throw new Error('expected exactly one ' + mark + ' in ' + file); };
let shell = fs.readFileSync(path.join(here, 'shell.html'), 'utf8');
one(shell, SLOT, 'shell.html');
let src = fs.readFileSync(path.join(here, 'bundle.pretty.js'), 'utf8');
one(src, MARK, 'bundle.pretty.js');
src = src.replace(MARK, () => fs.readFileSync(path.join(here, 'net.js'), 'utf8'));
fs.writeFileSync(path.join(here, 'bundle.build.js'), src);
cp.execSync('npx --yes esbuild@0.24.0 bundle.build.js --minify-whitespace --charset=utf8 --log-level=warning --outfile=bundle.min.js', { cwd: here, stdio: 'inherit' });
const js = fs.readFileSync(path.join(here, 'bundle.min.js'), 'utf8');
const css = fs.existsSync(path.join(here, 'extra.css')) ? fs.readFileSync(path.join(here, 'extra.css'), 'utf8') : '';
if (css) shell = shell.replace('</style>', () => css + '\n</style>');
// The game was renamed: 几猫 -> 四角洲 (title, menus, radio lines and in-world signage alike).
const OLD_NAME = '几猫', NEW_NAME = '四角洲';
const out = shell.replace(SLOT, () => js).split(OLD_NAME).join(NEW_NAME);
fs.writeFileSync(path.join(root, NEW_NAME + '国产3A大作_V2.html'), out);
fs.writeFileSync(path.join(root, 'game_v2.html'), out);
const pub = path.join(root, 'server', 'public');
if (fs.existsSync(path.join(root, 'server'))) {
  fs.mkdirSync(pub, { recursive: true });
  fs.writeFileSync(path.join(pub, 'index.html'), out);
}
console.log('built', (out.length / 1e6).toFixed(2) + ' MB', 'old-name occurrences left:', out.split(OLD_NAME).length - 1);
