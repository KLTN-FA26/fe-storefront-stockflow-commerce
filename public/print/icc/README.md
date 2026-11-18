# ICC profiles for the print file

The design studio embeds these profiles in `PRINT_READY` (PDF/X-4, Module 12 §3, open-question B35).
They are loaded by `src/features/product-design/components/studio/print-profiles.ts`.

| File                   | Use in the PDF                                                             | Source                                                                                                                                              | Licence                                                             |
| ---------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `ISOcoated_v2_eci.icc` | OutputIntent `FOGRA39`, "ISO Coated v2 (ECI)": the CMYK printing condition | European Color Initiative, package `eci_offset_2009.zip` from https://www.eci.org/doku.php?id=en:downloads (file dated 2007-02-28, 1 829 077 bytes) | ECI offset profiles are free to download, use and pass on           |
| `sRGB2014.icc`         | `ICCBased` colour space of every raster (the studio renders in sRGB)       | International Color Consortium, https://registry.color.org/rgb-registry/srgbprofiles (3 024 bytes)                                                  | ICC profiles from the registry may be used and redistributed freely |

Choice made with the user on 2026-11-18: paper cups print to the generic FOGRA39 condition until a
printer names its own profile; the RIP converts from it. Plastic cups (dry offset, white underlay)
need their own printing condition and are not covered here.

Do not edit these files. To change the printing condition, add the new profile here and change the
loader and `ISO_COATED_V2` in `engine/export/pdfx.ts` together.
