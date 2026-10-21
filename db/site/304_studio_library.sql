-- Applied 21 Oct 2026 as migration studio_library.
-- 1. Size and finish choices (product_params) on the Studio's main furniture: sofa (size, fabric), double bed (size, frame),
--    dining table (size, wood), coffee table (wood), TV console (width), desk (width 1000 to 1600 mm), rug (size).
--    Base prices stay the default-size price; options add or take away, so the Design Manager prices are unchanged.
-- 2. Eight new placeholder furniture items for empty categories (dining chair, bar stool, breakfast bar, dressing table,
--    bookshelf, sideboard, fridge freezer, bathroom mirror cabinet). Prices are placeholders, marked needs_review.
-- 3. ds_package() gains a 'library' section: the studio category tree and every published furniture product in it,
--    with sizes, options, prices, cover image and 3D model URL. Any furniture added in the admin Catalogue appears in the
--    3D Studio library; a .glb model uploaded on the product replaces its simple shape.
select 1;
