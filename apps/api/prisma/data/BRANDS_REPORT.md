# MAM! food brand dataset - report

Output: `brands.json` (79 brands). Generated from OSM NDJSON + Wikidata API + Commons API.

## Counts
- Brands: 79 (sorted by osmPlaceCount). 78 have >= 3 OSM places; Bakmi Naga has 2 (known Jakarta chain, flagged with `note`).
- With Wikidata QID: 64. Without (wikidata null): 15.
- With free logo on Commons: 30. With free image (photo): 34.
- Licenses accepted: Public domain, PD-*, CC0, CC BY x.x, CC BY-SA x.x (checked via extmetadata.LicenseShortName). Others were rejected; no files downloaded.

## Method notes
- osmPlaceCount: distinct OSM places (t="p") whose tags.brand or tags.name matches the brand regex (see defs.js). Name matching catches chains without a brand tag (Sederhana, Kopi Tuku, Wong Solo, ...).
- aliases, category and descriptionId are editorial (culinary knowledge), not from APIs. QIDs, websites, descriptions (English, Wikidata), file URLs and licenses come only from API responses.
- Logo chosen = the last free-licensed P154 value; image = first free P18.
- "Public domain" logos on Commons are typically PD due to simple text/geometry (threshold of originality). The trademark still belongs to the brand: show them only for identifying the brand, not as endorsement.

## Brands with no Wikidata item found (wikidata null, logo/image null)
Momoyo, Kopi Tuku, The Harvest, Ayam Bakar Wong Solo, MAKO Cake and Bakery, Sate Khas Senayan, Es Teh Indonesia, Bakso Boedjangan, Quickly (see below), Kopi Lain Hati, % Arabica, Martabak Orins, Pizza Marzano, Kopi Soe (only a single-outlet item found), Bakmi Naga.

## Skipped
- IKEA (furniture retail; restaurant is incidental), Coffee Time (ambiguous name; only a Canadian chain found on Wikidata), Indomaret/Alfamart-type retail.
- Generic dish/outlet names (warteg, bakso, soto, RM Padang, geprek) are not brands.
- Extra known chains with zero OSM matches were not added.

## Uncertain matches (please review)
- Rumah Makan Sederhana -> Q20427355 "Restoran Sederhana" (Indonesian company). Likely the Padang chain, but "Sederhana" is a very generic name; the 161 OSM count mixes warteg/warung called Sederhana.
- Quickly: only Q3771463 (described as American bubble-tea chain) found; set to null because it may not be the Taiwan/Indonesia operator.
- Texas Chicken -> Q1089932 "Church's Texas Chicken" (same brand, Texas Chicken outside the US). Wikidata website pointed to a US site, so website is null; its image is the Church's logo.
- Popeyes: website from Wikidata was the Canadian site, so set to null.
- Fore Coffee has two Wikidata items (Q66424373 chosen, Q133463146 duplicate); Q66424373 has odd instance-of (software).
- Tous Les Jours: Q3535609 (Korean bakery chain) chosen; duplicate Q132154221 exists.
- Solaria -> Q118136107 (Indonesian-language description "perusahaan asal Indonesia"; label only, no English description).
- Waroeng Steak & Shake Q13098421 and Gudeg Yu Djum Q19745849: no English label/description, matched by Indonesian label and instance-of (restaurant/business).
- Genki Sushi -> Q5533323 is the parent company (Genki Global Dining Concepts); HokBen -> Q5877948 is described as a company.
- Mixue -> Q107406476 (Mixue Ice Cream & Tea, parent in China).
- MAKO Cake and Bakery: regex `^mako\b` may include non-bakery places named Mako.
- Dunkin' and Dunkin' Donuts merged; J.CO and "J.Co Donuts'" merged; A&W OSM brand merged with Indonesian A&W (Q277641 is the US chain entity).
- Chatime, Mixue, Haus!, CoCo etc: categories chosen by editorial judgment (beverages).
