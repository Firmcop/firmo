-- Seed the new site tables with the content the website shows today. Safe to re-run.
insert into public.store_items(sku, name, category, unit, price, stock, fits, swatch, texture, sort) values
 ('DR-STL','Steel security door','Doors','no.',38000,22,'Pre-hung, 900 × 2100 mm. Fits container and stud walls.','#2E3133','none',1),
 ('DR-MAH','Solid mahogany door','Doors','no.',46000,8,'Internal or sheltered external. Timber frame included.','#6E3F22','boards',2),
 ('DR-GLS24','Aluminium glass slider 2.4 m','Doors','no.',85000,3,'Needs a lintel in container walls. Engineer check applies.','#9DB4BF','none',3),
 ('DR-RS44','Roller shutter door 4 × 4 m','Doors','no.',165000,2,'For steel structures. Manual or motorised.','#5E6E76','boards',4),
 ('WIN-ALU12','Aluminium sliding window 1.2 × 1.2 m','Windows','no.',18500,64,'Clear glass, mosquito mesh, burglar bars optional.','#9DB4BF','grid',5),
 ('WIN-UPV12','uPVC double-glazed window 1.2 × 1.2 m','Windows','no.',32000,6,'Quieter and cooler. Good for highland and roadside sites.','#B9CCD5','grid',6),
 ('CLD-FCB9','Fibre cement board 9 mm','Cladding','m²',2300,640,'Paint-ready. Fixes to steel or timber battens.','#8F8A80','panels',7),
 ('CLD-CRG','Corrugated steel profile, painted','Cladding','m²',1450,1200,'Four factory colours. Matches container profile.','#B5462A','ribs',8),
 ('CLD-TMB','Cypress shiplap, treated','Cladding','m²',2900,260,'Kiln-dried, pressure-treated, natural finish.','#A9744A','boards',9),
 ('CLD-WPC','Composite WPC cladding','Cladding','m²',3600,90,'Low maintenance, no painting. Concealed clips.','#6B5644','boards',10),
 ('INS-PIR100','PIR board 100 mm','Insulation','m²',1850,420,'Best thermal value per mm. Walls and roofs.','#D8C36A','none',11),
 ('INS-RW75','Rockwool slab 75 mm','Insulation','m²',950,800,'Fire-resistant and acoustic. Stud walls.','#C9A66B','none',12),
 ('INS-PU50','Spray PU foam 50 mm','Insulation','m²',1200,2000,'Applied by our crew. Seals container corrugations.','#E4D9B8','none',13),
 ('FLR-SPC5','SPC vinyl plank 5 mm','Flooring','m²',2100,500,'Waterproof click-lock. Kitchens and bathrooms.','#B89B78','boards',14),
 ('FLR-LAM8','Laminate 8 mm','Flooring','m²',1700,350,'Dry rooms only. Underlay included.','#C7A57E','boards',15),
 ('FLR-OAK14','Engineered oak 14 mm','Flooring','m²',5400,40,'Real oak top layer. Ships in five weeks when out.','#9C7246','boards',16),
 ('RF-BOX05','Box-profile roofing sheet 0.5 mm','Roofing','m²',1350,2500,'Cut to length. A-frames, cabins and steel roofs.','#2F4550','ribs',17)
on conflict (sku) do nothing;

insert into public.investment_opportunities(slug, name, sector, place, spec, units, taken, price, yield_lo, yield_hi, opens, status_label, own_terms, operator, split, story, image_url, published, sort) values
 ('riverside-eco-resort','[Riverside eco-resort]','Hospitality','[Location]','24 cabins from 20 ft containers, lounge, pool deck',24,15,2600000,11,14,'Q2 2027','Building now','One cabin, on a [sectional title or long lease]','[Hospitality operator]','60% to owners, 40% to operator','A low-density resort on a river frontage, with cabins spaced for privacy, a shared lounge and a pool deck. Booked through the operator and major platforms.','/_blob/1148ec4f8c7496bd7c3c61324e78a073',true,1),
 ('highway-strip-mall','[Highway strip mall]','Retail','[Town]','12 shops in a row with 24 parking bays',12,7,1400000,13,16,'Q1 2027','7 pre-leased','One shop unit with its tenancy','[Property manager]','85% to owners, 15% to manager','Roadside shops on a busy route, with tenants signed before construction. Long leases with annual rent reviews.','/_blob/c443aeb1df9da124515acb87cccc69cf',true,2),
 ('hilltop-pod-village','[Hilltop pod village]','Hospitality','[Location]','16 Airbnb pods with decks and a shared fire pit',16,4,1900000,10,13,'Q3 2027','Now open for reservation','One pod, on a [sectional title or long lease]','[Hospitality operator]','70% to owners, 30% to operator','Compact pods on a view plot, aimed at weekend and remote-work stays. Each pod has a private deck and self check-in.','/_blob/b63e77804b6d09a9cbb2a3a7b8ff94e5',true,3),
 ('campus-rental-block','[Campus rental block]','Residential','[Town]','20 stacked one-bed units near a university',20,20,2900000,9,11,'Q4 2026','Fully reserved','One unit with its tenancy','[Property manager]','85% to owners, 15% to manager','Two-level rental block for students and young professionals, close to campus and transport.','/_blob/34e98516af54244cb1e1a80f0a5f434d',true,4)
on conflict (slug) do nothing;
