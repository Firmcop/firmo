#!/usr/bin/env python3
"""Build the Firmcop website for Vercel from the canvas prototype pages + the 3D tools.

Usage: build_site.py <canvas/project dir> <f3d dir> <firm/src dir> <jpg dir> <out dir>
The canvas pages stay the source of truth; this script only applies deploy-time changes.
"""
import os, re, shutil, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import site_patches

canvas, f3d, firm, jpgs, out = sys.argv[1:6]
ARTIFACT = 'https://claude.ai/artifact/RTs3DaQBKaZfT8NqWALgM3'
BLOBS = {  # canvas asset id -> generated render
    '6bbd5d303917960ea2a0c0ac7ba546a7': 'aframe', '934cee1933bb4f74580e99cf52bfbbdc': 'cabin',
    'e25e7e96e47c5616c4fdc8c27059a5ac': 'container', '1148ec4f8c7496bd7c3c61324e78a073': 'eco-resort',
    'df4db3dfc8df8029817310780a905950': 'interior-bedroom', '1b60a8af5e2aacf8f0ee0ae7c114fdf4': 'interior-living',
    '8f71d74f798a20f37854d9ceab7dbc74': 'kiosk', 'b63e77804b6d09a9cbb2a3a7b8ff94e5': 'pod-village',
    '31faaccf8dfd53a2cf2e363b3365c3c0': 'site-camp', 'c443aeb1df9da124515acb87cccc69cf': 'strip-mall',
    '34e98516af54244cb1e1a80f0a5f434d': 'twin-container', 'ad198461426af454fde500cf62dc0e6d': 'warehouse',
    '2c22d41bdd87f85716803400ede0e82b': 'yard-electrical', 'baf01406d1e201b29b1be20833ec2c9f': 'yard-insulation',
    '1ee10acb3ca6b3ba53a693fa596afbdd': 'yard-openings',
}
PAGES = ['Main', 'Catalog', 'DesignDetail', 'Configurator', 'Store', 'Projects', 'Invest', 'Opportunities', 'Portal', 'Team']

if os.path.exists(out): shutil.rmtree(out)
os.makedirs(os.path.join(out, 'img')); os.makedirs(os.path.join(out, '_blob'))

def fix_links(s):
    # the 3D Studio lives on this site now
    s = s.replace(f'<a href="{ARTIFACT}">3D Studio</a>', '<a href="3d-studio.html">3D Studio</a>')
    s = s.replace(f'href="{ARTIFACT}" style="color:#D8CFC0;text-decoration:none;padding:4px 0">Firmcop 3D Studio</a>', 'href="tools.html" style="color:#D8CFC0;text-decoration:none;padding:4px 0">Firmcop 3D tools</a>')
    s = s.replace(f'href="{ARTIFACT}"', 'href="3d-studio.html"')
    s = s.replace('href="Studio.dc.html"', 'href="3d-studio.html"')
    s = s.replace('href="design-studio.html', 'href="3d-studio.html')
    return s

LIVE_CTOR = """    this.state = { type: 'All', use: 'all', asc: true, live: null };
    const cfg = window.FC_SUPA, DS = window.DS;
    if (cfg && DS) {
      fetch(cfg.url + '/rest/v1/rpc/ds_package', { method: 'POST', headers: { apikey: cfg.key, 'Content-Type': 'application/json' }, body: '{}' })
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .catch(() => fetch('ds-package.json').then((r) => r.json()))
        .then((pkg) => {
          DS.applyPackage(pkg);
          const TYPE = { container: 'Container', aframe: 'A-frame', cabin: 'Cabin' };
          const live = (pkg.designs || []).map((d) => {
            const P = d.layout, G = DS.grid(P), R = DS.roomInfo(P, G), L = DS.lining(P, G), Q = DS.quote(P, G, R, L);
            const beds = R.filter((r) => r.type === 'bed').length;
            return { name: d.name, slug: d.slug, type: TYPE[d.system] || 'Container', area: Math.round(R.reduce((a, r) => a + r.area, 0) * 10) / 10,
              beds: beds ? beds + ' bed' : 'Studio', weeks: Q.weeks, price: Math.round(Q.total), use: d.system === 'container' ? ['home', 'hospitality'] : ['home', 'hospitality'], blurb: d.summary || '', live: true };
          });
          this.setState({ live });
        })
        .catch(() => {});
    }"""

for name in PAGES:
    s = open(os.path.join(canvas, name + '.dc.html')).read()
    s = fix_links(s)
    if name == 'Catalog':
        s = s.replace("    this.state = { type: 'All', use: 'all', asc: true };", LIVE_CTOR, 1)
        s = s.replace("    let list = all.filter(", """    const liveRows = this.state.live || [];
    const replaced = { 'Container studio 20': 1, 'Container one-bed 40': 1, 'Twin 40 family': 1, 'Veranda cabin': 1 };
    const merged = liveRows.length ? liveRows.concat(all.filter((d) => !replaced[d.name] && !liveRows.some((l) => l.name === d.name))) : all;
    let list = merged.filter(""", 1)
        s = s.replace("    const U3 = '" + ARTIFACT + "';", "    const SYSIMG = { 'Container': '/_blob/34e98516af54244cb1e1a80f0a5f434d', 'A-frame': '/_blob/6bbd5d303917960ea2a0c0ac7ba546a7', 'Cabin': '/_blob/934cee1933bb4f74580e99cf52bfbbdc' };", 1)
        s = s.replace("      img: IMG[d.name] || '/_blob/e25e7e96e47c5616c4fdc8c27059a5ac',", "      img: IMG[d.name] || SYSIMG[d.type] || '/_blob/e25e7e96e47c5616c4fdc8c27059a5ac',", 1)
        s = s.replace("      has3d: !!d.code, url3d: d.code ? U3 : '',", "      has3d: !!d.code, url3d: d.code ? 'studio.html?design=' + d.code : '',\n      cfgHref: d.slug ? '3d-studio.html?design=' + encodeURIComponent(d.slug) : 'Configurator.dc.html',", 1)
        s = s.replace('<a class="lnk-l" href="Configurator.dc.html">Configure</a>\n<sc-if', '<a class="lnk-l" href="{{d.cfgHref}}">Configure</a>\n<sc-if', 1)
        s = s.replace('<script src="./support.js"></script>', '<script src="./ds-config.js"></script>\n<script src="./ds-core.js"></script>\n<script src="./support.js"></script>', 1)
        for must in ['live: null', 'const merged', 'SYSIMG', 'cfgHref', '{{d.cfgHref}}', 'ds-core.js']:
            assert must in s, (name, must)
    s = site_patches.patch_page(name, s)
    assert ARTIFACT not in s, (name, 'artifact link left')
    open(os.path.join(out, name + '.dc.html'), 'w').write(s)

# runtime
shutil.copy(os.path.join(firm, 'support.js'), out)
# canvas images at the paths the pages use
for bid, fn in BLOBS.items():
    shutil.copy(os.path.join(jpgs, fn + '.jpg'), os.path.join(out, '_blob', bid))
for fn in os.listdir(os.path.join(f3d, 'img')):
    shutil.copy(os.path.join(f3d, 'img', fn), os.path.join(out, 'img', fn))
# 3D tools and data
for fn in ['fc-site.js', 'admin.html', 'design-studio.html', 'design-manager.html', 'collection.html', 'ds-core.js', 'ds-config.js', 'ds-package.json', 'studio.html', '2x4.html', 'three-d-stage.js', 'platform-rules.js', 'firmcop-bridge.js']:
    shutil.copy(os.path.join(f3d, fn), out)
# the Studio as a page of the site: site header on top, Studio framed beneath
shutil.copy(os.path.join(f3d, 'site-studio.html'), os.path.join(out, '3d-studio.html'))
d = open(os.path.join(out, 'design-studio.html')).read()
old = '<a class="mark" href="index.html">'
assert old in d
d = d.replace(old, '<a class="mark" href="Main.dc.html" target="_top">')
d = site_patches.patch_studio(d)
# inside the site page the site header already carries the brand, so drop the Studio's own mark
d = d.replace('</head>', '<script>if (window.top !== window) document.documentElement.classList.add("in-site");</script>\n<style>.in-site .mark{display:none}</style>\n</head>', 1)
open(os.path.join(out, 'design-studio.html'), 'w').write(d)
tools = open(os.path.join(f3d, 'index.html')).read()
open(os.path.join(out, 'tools.html'), 'w').write(tools)
x = open(os.path.join(out, '2x4.html')).read().replace('<a href="index.html" style="font-size:12px">← Back to Firmcop 3D</a>', '<a href="tools.html" style="font-size:12px">← Back to Firmcop 3D</a>')
open(os.path.join(out, '2x4.html'), 'w').write(x)
# the live collection is now the Catalog page; keep collection.html reachable but point people there
c = open(os.path.join(out, 'collection.html')).read().replace('<a href="collection.html" aria-current="page">Collection</a>', '<a href="Catalog.dc.html" aria-current="page">Collection</a>')
open(os.path.join(out, 'collection.html'), 'w').write(c)

vercel = {
  "cleanUrls": False,
  "rewrites": [{"source": "/", "destination": "/Main.dc.html"}],
  "redirects": [
    {"source": "/collection", "destination": "/Catalog.dc.html", "permanent": False},
    {"source": "/design-studio", "destination": "/3d-studio.html", "permanent": False},
    {"source": "/3d-studio", "destination": "/3d-studio.html", "permanent": False},
    {"source": "/admin", "destination": "/admin.html", "permanent": False},
    {"source": "/my-builds", "destination": "/Portal.dc.html", "permanent": False},
    {"source": "/design-manager", "destination": "/design-manager.html", "permanent": False},
    {"source": "/studio", "destination": "/studio.html", "permanent": False},
    {"source": "/2x4", "destination": "/2x4.html", "permanent": False},
  ],
  "headers": [
    {"source": "/(.*)", "headers": [
      {"key": "X-Content-Type-Options", "value": "nosniff"},
      {"key": "Referrer-Policy", "value": "strict-origin-when-cross-origin"},
      {"key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()"}]},
    {"source": "/_blob/(.*)", "headers": [{"key": "Content-Type", "value": "image/jpeg"}, {"key": "Cache-Control", "value": "public, max-age=31536000, immutable"}]},
    {"source": "/img/(.*)", "headers": [{"key": "Cache-Control", "value": "public, max-age=31536000, immutable"}]},
    {"source": "/ds-package.json", "headers": [{"key": "Cache-Control", "value": "public, max-age=300"}]},
  ],
}
open(os.path.join(out, 'vercel.json'), 'w').write(json.dumps(vercel, indent=2) + '\n')
# the tools pages also open the Studio inside the site
for fn in ['tools.html', 'collection.html', 'design-manager.html']:
    fp = os.path.join(out, fn); t = open(fp).read().replace("design-studio.html", "3d-studio.html")
    open(fp, 'w').write(t)
print('built', len(os.listdir(out)), 'entries in', out)
