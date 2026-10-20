"""Seed SQL for catalog_products from the live firmcop product list (copied read-only on 20 Oct 2026)."""
import re
G = 'https://razgnrakpthcdfwihamo.supabase.co/storage/v1/object/public/product-images/'
U = 'https://images.unsplash.com/'
# name, live slug, new category slug, price KES, unit, summary, [images], featured
P = [
 ("Container Apartment, 2 bedroom", "container-apartment-2-bedroom", "container-homes", 34700, "per m²", "Eco-conscious contemporary container residence with clean industrial lines.", [G+"1788552458484-l58eh4wr59f.webp"], False),
 ("2-Bedroom Modular Cabin", "2-bed-modular-cabin", "cabin-2bed", 38500, "per unit", "Prefabricated 2-bedroom cabin with kitchen, bathroom and open-plan living. Delivered fully fitted and ready for connection.", [G+"prod-2bed-cabin.jpg"], True),
 ("Luxury Container Resort Suite", "luxury-container-resort-suite", "container-homes", 1200000, "per unit", "Container suites for hospitality and eco-resorts, with rooftop decks, floor-to-ceiling glazing and timber finishes.", [G+"1788553784498-wkm59z4ovi.webp", G+"1788553800302-hvprmaxkzjo.webp", G+"1788553802157-futiyl0jh89.webp"], False),
 ("1-Bedroom Cabin 32 m²", "demo-1br-cabin-32", "cabin-1bed", 1450000, "per unit", "One-bedroom cabin with separate living, kitchen and bathroom.", [U+"photo-1568605114967-8130f3a36994?w=1200"], False),
 ("2-Bedroom Cabin 48 m²", "demo-2br-cabin-48", "cabin-2bed", 2150000, "per unit", "Family cabin with two bedrooms, open living and full bathroom.", [U+"photo-1564013799919-ab600027ffc6?w=1200"], True),
 ("Urban Multi-Storey Container Complex", "urban-multi-story-container-complex", "container-homes", 4500000, "per unit", "Multi-storey container homes with rooftop terraces, green walls and floor-to-ceiling glazing.", [G+"1788553020255-9n0h0yaios9.webp"], False),
 ("The Heritage Luxury Container Villa", "the-heritage-luxury-container-villa", "container-homes", 8500000, "per unit", "Double-storey off-grid container home with bespoke cultural artistry and glass facades.", [G+"1788553018070-b0g36ur6kgd.webp"], False),
 ("40ft High Cube Container", "40ft-shipping-container", "container-dry", 4500, "per unit", "40ft high-cube container with extra height for taller cargo or conversions.", [G+"prod-40ft-container.jpg"], True),
 ("20ft Standard Container", "demo-20ft-standard-container", "container-dry", 285000, "per unit", "Wind- and watertight 20ft ISO container for storage or conversion.", [U+"photo-1494412651409-8963ce7935a7?w=1200"], True),
 ("20ft High Cube Container", "demo-20ft-high-cube-container", "container-dry", 315000, "per unit", "Extra-tall 20ft container with 30 cm more headroom for cabin and office conversions.", [U+"photo-1605713288610-00ec19f0a847?w=1200"], False),
 ("40ft Standard Container", "demo-40ft-standard-container", "container-dry", 495000, "per unit", "Full 40ft ISO container for warehousing, stacking and large fabrications.", [U+"photo-1577563908411-5077b6dc7624?w=1200"], False),
 ("40ft High Cube Container (conversion grade)", "demo-40ft-high-cube-container", "container-dry", 545000, "per unit", "The most popular base for two-bedroom container homes.", [U+"photo-1601584115197-04ecc0da31d7?w=1200"], True),
 ("40ft Refrigerated Container", "demo-40ft-reefer-container", "container-reefers", 1250000, "per unit", "Insulated reefer for cold storage: pharma, agribusiness, frozen logistics.", [U+"photo-1586528116311-ad8dd3c8310d?w=1200"], False),
 ("20ft Container Site Office", "container-site-office", "container-offices", 8900, "per unit", "Fitted 20ft office with insulation, electrics, lighting, windows and a personnel door.", [G+"prod-container-office.jpg"], True),
 ("Container Site Office", "demo-container-site-office", "container-offices", 650000, "per unit", "Turn-key 20ft site office with insulation, electrical, AC and lockable door.", [U+"photo-1497366216548-37526070297c?w=1200"], True),
 ("Container Ablution Block", "demo-container-ablution-block", "container-ablutions", 780000, "per unit", "Watertight 20ft ablution unit: 4 toilets, 2 showers, hand-wash bay.", [U+"photo-1552321554-5fefe8c9ef14?w=1200"], False),
 ("Twin-Container Outdoor Lounge and Office Suite", "twin-container-outdoor-lounge-office-suite", "container-offices", 1450000, "per unit", "Two 20ft containers joined by a central canopy and deck, for cafes, breakrooms or garden offices.", [G+"1777310952541-lsd1wln5lfo.webp"], False),
 ("Container Clinic", "demo-container-clinic", "container-clinics", 1450000, "per unit", "Mobile clinic with consultation room, treatment bay and pharmacy storage.", [U+"photo-1519494026892-80bbd2d6fd0d?w=1200"], False),
 ("Container Restaurant", "demo-container-restaurant", "container-kitchens", 1850000, "per unit", "40ft food and beverage container with serving window, kitchen and seating deck.", [U+"photo-1567521464027-f127ff144326?w=1200"], True),
 ("2-Storey Stacked Office", "demo-2storey-stacked-office", "container-offices", 1950000, "per unit", "Two stacked 20ft offices with internal staircase, 28 m² of workspace.", [U+"photo-1486325212027-8081e485255e?w=1200"], False),
 ("Luxury 40ft Container Cabin with Rooftop Terrace", "luxury-40ft-container-cabin-with-rooftop-terrace", "container-homes", 2850000, "per unit", "40ft conversion with WPC cladding and a rooftop terrace with glass balustrades.", [G+"1777310951568-konqt46qzxf.webp"], False),
 ("The Firmcop Grand Vista Container Villa", "the-firmcop-grand-vista-container-villa", "container-homes", 4250000, "per unit", "Multi-level container villa with a rooftop terrace and a high-ceiling living wing.", [G+"1777310953689-lwbnndu8ki9.webp"], False),
 ("Modular Container Retail Park", "modular-container-retail-park-mall-hub", "container-retail", 4500000, "per unit", "Multi-level modular container retail hub for rapid deployment and foot traffic.", [G+"1788554476638-fg1bff1tvw.webp", G+"1788554585146-8uxw0f4gqzo.webp", G+"1788554586707-1g5l95to12j.webp"], False),
 ("Luxury Cantilevered Multi-Level Container Home", "luxury-cantilevered-multi-level-container-home", "container-homes", 4500000, "per unit", "Cantilevered container home with charcoal finish and floor-to-ceiling glazing.", [G+"1777310958891-spikhr69j2s.webp"], False),
 ("The Summit Hybrid Container Villa", "the-summit-hybrid-container-villa", "aframe-combos", 4850000, "per unit", "Double-storey container home with an A-frame expansion and a rooftop terrace.", [G+"1777310957621-42bi429hhsf.webp"], False),
 ("The Horizon Multi-Level Container Villa", "the-horizon-multi-level-container-villa", "container-homes", 4850000, "per unit", "Double-storey container villa with a rooftop lounge and panoramic glazing.", [G+"1777310956245-ijejyq07pxi.webp"], False),
 ("Executive Multi-Storey Container Villa", "executive-multi-story-container-villa", "container-homes", 8500000, "per unit", "Multi-level container villa with glass facades, balconies and integrated LED lighting.", [G+"1777310955348-4jyzwgo2vud.webp"], False),
 ("Multi-Storey Modular Container Mall Complex", "multi-storey-modular-container-mall-complex", "container-retail", 45000000, "per unit", "High-density retail complex of stacked 20ft and 40ft containers with steel walkways.", [G+"1788553015020-drdfbjic23a.webp", G+"1788553368559-j1pmfrm7jd9.webp"], False),
 ("Studio Cabin 18 m²", "demo-studio-cabin-18", "cabin-studio", 850000, "per unit", "Compact studio cabin with bed, kitchenette and en-suite.", [U+"photo-1518780664697-55e3ad937233?w=1200"], True),
 ("Site Bunkhouse", "demo-site-bunkhouse", "cabin-bunkhouse", 1350000, "per unit", "Worker accommodation cabin for 8 to 12 people.", [U+"photo-1555854877-bab0e564b8d5?w=1200"], False),
 ("Eco Cabin", "demo-eco-cabin", "cabin-eco", 1750000, "per unit", "Off-grid cabin, ready for solar, rainwater and a composting toilet.", [U+"photo-1542718610-a1d656d1884c?w=1200"], False),
 ("The Horizon Modular Cabin with Rooftop Terrace", "the-horizon-modular-cabin-with-rooftop-terrace", "cabin-eco", 4850000, "per unit", "Modular cabin with a mono-pitch roof, rooftop lounge and stone-look cladding.", [G+"1777310956976-8582fziclxv.webp"], False),
 ("Insulated Glamping Pod", "glamping-pod", "cabin-pods", 14500, "per unit", "Curved-roof pod with insulated shell for resorts and garden offices.", [G+"prod-glamping-pod.jpg"], False),
 ("Sleeping Pod", "demo-sleeping-pod", "cabin-pods", 285000, "per unit", "Single sleeping pod with bed, USB ports and reading light.", [U+"photo-1631049307264-da0ec9d70304?w=1200"], False),
 ("Office Pod", "demo-office-pod", "cabin-pods", 520000, "per unit", "Acoustic 4-person meeting pod for offices and co-working.", [U+"photo-1497366754035-f200968a6e72?w=1200"], False),
 ("Glamping Dome Pod", "demo-glamping-dome", "cabin-pods", 680000, "per unit", "Geodesic dome, 5 m diameter, panoramic windows, insulated.", [U+"photo-1504280390367-361c6d9f38f4?w=1200"], True),
 ("Spa and Sauna Pod", "demo-spa-sauna-pod", "cabin-pods", 920000, "per unit", "Cedar-lined sauna pod with bench seating for 4.", [U+"photo-1571902943202-507ec2618e8f?w=1200"], False),
 ("A-Pod Suite", "demo-a-pod-suite", "aframe-pods", 1450000, "per unit", "Boutique A-frame pod with en-suite for resorts and short stays.", [U+"photo-1520637836862-4d197d17c55a?w=1200"], True),
 ("Container and A-frame Combo House", "container-aframe-combo-house", "aframe-combos", 29000, "per m²", "Two 20ft containers combined with an A-frame for about 85 m² of living space.", [G+"1777307394642-2r722iq7j7f.webp"], False),
 ("A-Frame Holiday Cabin", "aframe-cabin", "aframe-40", 32000, "per unit", "Timber-clad A-frame for short-stay rentals and weekend retreats.", [G+"prod-aframe-cabin.jpg"], True),
 ("A-Frame Pod", "demo-aframe-pod", "aframe-pods", 780000, "per unit", "Tiny A-frame pod for garden offices and weekend hideaways.", [U+"photo-1600596542815-ffad4c1539a9?w=1200"], False),
 ("Mini A-Frame 25 m²", "demo-mini-aframe-25", "aframe-25", 1250000, "per unit", "Compact A-frame studio for short-stay rentals.", [U+"photo-1449158743715-0a90ebb6d2d8?w=1200"], False),
 ("Classic A-Frame 40 m²", "demo-classic-aframe-40", "aframe-40", 1850000, "per unit", "One-bedroom A-frame with kitchen, bath and sleeping loft.", [U+"photo-1615873968403-89e068629265?w=1200"], True),
 ("Loft A-Frame 50 m²", "demo-loft-aframe-50", "aframe-50", 2350000, "per unit", "A-frame with extended loft and double-height living room.", [U+"photo-1587381420270-3e1a5b9e6904?w=1200"], False),
 ("Family A-Frame 60 m²", "demo-family-aframe-60", "aframe-60", 2750000, "per unit", "Two-bedroom A-frame for family escapes and resort cabins.", [U+"photo-1604014237800-1c9102c219da?w=1200"], True),
 ("Vertical Storage Tank, 20,000 L", "vertical-storage-tank", "steel-tanks", 12500, "per unit", "Carbon steel vertical tank for water, fuel or chemicals, with custom coatings.", [G+"prod-storage-tank.jpg"], False),
 ("ASME Code Pressure Vessel", "asme-pressure-vessel", "steel-tanks", 18500, "per unit", "Pressure vessel built to ASME VIII for compressed air, steam and process use.", [G+"prod-pressure-vessel.jpg"], False),
 ("5,000 L Steel Water Tank", "demo-water-tank-5000l", "steel-tanks", 95000, "per unit", "Welded mild-steel water tank with epoxy lining for potable water.", [U+"photo-1581094288338-2314dddb7ece?w=1200"], False),
 ("10,000 L Steel Water Tank", "demo-water-tank-10000l", "steel-tanks", 165000, "per unit", "Mid-capacity tank for estates, schools and small industry.", [U+"photo-1602173574767-37ac01994b2a?w=1200"], True),
 ("20,000 L Diesel Storage Tank", "demo-diesel-tank-20000l", "steel-tanks", 485000, "per unit", "Bunded diesel tank with 110% spill containment for fleet depots.", [U+"photo-1611288875785-f4196eebf516?w=1200"], False),
 ("Industrial Mixing Vessel", "demo-mixing-vessel-2000l", "steel-tanks", 1450000, "per unit", "Stainless 2,000 L jacketed mixing vessel for food and chemical industries.", [U+"photo-1581093458791-9d09a5b1c9a5?w=1200"], False),
 ("20ft ISO Powder Tank Container", "20ft-iso-powder-tank-container", "steel-tanks", 2450000, "per unit", "ISO tank for bulk cement, lime and fly ash in a reinforced 20ft frame.", [G+"1788637081662-3idnr0znqz7.webp"], False),
 ("20ft ISO Powder Tank Container (second listing)", "20ft-iso-powder-tank-container-2", "steel-tanks", 2450000, "per unit", "ISO tank for bulk cement, lime and dry minerals in a heavy-duty 20ft frame.", [G+"1788637130018-artnqsw0ymi.webp"], False),
 ("ISO Powder Tank Container, cement and lime", "iso-powder-tank-container-cement-lime", "steel-tanks", 2850000, "per unit", "ISO tank for bulk cement, lime and fly ash in a reinforced 20ft frame.", [G+"1788637130780-azyf1u8yayl.webp"], False),
 ("LPG Pressure Vessel 5 t", "demo-lpg-vessel-5t", "steel-tanks", 2850000, "per unit", "5-tonne LPG storage vessel certified to ASME / EN standards.", [U+"photo-1611288875785-f4196eebf516?w=1200"], True),
 ("ISO Powder Tank Container", "iso-powder-tank-container", "steel-tanks", 2850000, "per unit", "ISO tank for cement, hydrated lime and granulated products in a reinforced frame.", [G+"1788637129404-5idrup2jgc.webp"], False),
 ("Industrial Steel Mezzanine", "steel-mezzanine", "steel-mezzanines", 22000, "per project", "Structural steel mezzanine for warehouses and factories, engineered to your floor plan.", [G+"prod-mezzanine.jpg"], False),
 ("Roof Truss System", "demo-roof-truss-system", "steel-trusses", 195000, "per truss", "Engineered steel roof truss, 12 m clear span, for godowns.", [U+"photo-1503387762-592deb58ef4e?w=1200"], False),
 ("Industrial Steel Staircase", "demo-steel-staircase", "steel-stairs", 285000, "per unit", "Heavy-duty external staircase, 10 risers, mill-finished steel.", [U+"photo-1518709268805-4e9042af9f23?w=1200"], False),
 ("Industrial Walkway", "demo-industrial-walkway", "steel-stairs", 385000, "per 5 m", "Elevated steel walkway with grating deck and safety railings.", [U+"photo-1565008447742-97f6f38c985c?w=1200"], False),
 ("Steel Mezzanine Floor", "demo-mezzanine-floor", "steel-mezzanines", 625000, "per unit", "Modular 50 m² mezzanine platform with stair and handrail.", [U+"photo-1565008447742-97f6f38c985c?w=1200"], False),
 ("Warehouse Frame 200 m²", "demo-warehouse-frame-200", "steel-warehouses", 1850000, "per unit", "Pre-engineered steel warehouse frame, 10 × 20 m, ready for cladding.", [U+"photo-1581094794329-c8112a89af12?w=1200"], True),
 ("Modular Commercial Showroom, double storey", "modern-modular-commercial-showroom-double-storey", "steel-showrooms", 9500000, "per unit", "Steel-framed double-storey showroom with a full glass facade and integrated LED lighting.", [G+"1788553013022-6eemvxroy6n.webp"], False),
]
assert len(P) == 63, len(P)
def q(v):
    if v is None: return 'null'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return str(v)
    if isinstance(v, list): return ("array[" + ','.join(q(x) for x in v) + "]::text[]") if v else "'{}'::text[]"
    return "'" + str(v).replace("'", "''") + "'"
rows = []
SEEN = set()
for name, slug, cat, price, unit, summ, imgs, feat in P:
    s = re.sub(r'^demo-', '', slug).strip('-')
    if s in SEEN: s += '-turnkey'
    SEEN.add(s)
    placeholder = slug.startswith('demo-')
    per_area = unit == 'per m²'
    review = (not per_area) and price < 50000      # looks like a USD figure in a KES field
    rows.append('(' + ','.join([q('firmcop-' + s), q(name), q('building'), q(cat), q(summ), q(unit), q('quote' if review else 'fixed'), q(price), q(imgs[0]), q(imgs), q('live firmcop products, ' + slug), q(placeholder), q(review), q(not review), q(feat and not review)]) + ')')
sql = ('with t(slug, name, kind, cat, summary, unit, price_mode, base_price, cover_url, images, source, is_placeholder, needs_review, published, featured) as (values\n'
       + ',\n'.join(rows) + ')\n'
       'insert into public.catalog_products(slug, name, kind, category_id, summary, unit, price_mode, base_price, cover_url, images, source, is_placeholder, needs_review, published, featured)\n'
       'select t.slug, t.name, t.kind, c.id, t.summary, t.unit, t.price_mode, t.base_price, t.cover_url, t.images, t.source, t.is_placeholder, t.needs_review, t.published, t.featured\n'
       'from t join public.catalog_categories c on c.slug = t.cat on conflict (slug) do nothing;\n')
open('/tmp/claude-0/-home-claude/c818e64d-9d42-570b-807a-a87da28fe5ab/scratchpad/db/301_products_live.sql', 'w').write(sql)
print(sum(1 for r in P if r[3] < 50000 and r[4] != 'per m²'), 'flagged for price review;', sum(1 for r in P if r[1].startswith('demo-')), 'placeholders')
