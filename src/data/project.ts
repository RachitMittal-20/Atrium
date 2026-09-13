/**
 * src/data/project.ts
 *
 * Seed data for ATRIUM's one demo project — Meridian House, a residential
 * apartment interior fit-out, currently in Client Review. This is real
 * interior-design-document language, not construction-shell specs: a
 * sofa is specified by fabric and frame, a range by brand and model, a
 * wall by paint line and sheen. Lead times are given in weeks wherever an
 * item would need reordering, refabrication, or reupholstering.
 *
 * There is exactly one Element per interactive mesh in
 * BuildingModel.MESH_ENTRIES, and Element.meshName reuses that mesh's id
 * verbatim — that's what lets a click in the 3D scene resolve straight to
 * a real spec-sheet entry via projectStore.getElementByMeshId. (Note: the
 * brief that started this file said "44 meshes" — MESH_ENTRIES actually
 * has 43 interactive entries, two decorative edge-outline meshes aside.
 * This covers all 43; there is no 44th to invent.)
 *
 * A handful of entries (the building shell, one small wall fixture) are
 * marked honestly as out of scope or unconfirmed rather than filled with
 * an invented spec — a fabricated line for something a designer couldn't
 * actually know yet would read as fake faster than an honest gap would.
 */
import type { Annotation, Element, Project, Revision } from "@/types/project";

export const PROJECT: Project = {
  id: "meridian-house",
  name: "Meridian House",
  code: "MH-01",
  client: "R. Voss",
  phase: "Client Review",
  address: "Apartment 6, Meridian House, 42 Ashfield Road, London NW3 5RT",
  revision: "R03",
};

// ---------------------------------------------------------------------------
// Elements — one per BuildingModel.MESH_ENTRIES id, grouped to match that
// file's own grouping (envelope, architecture, kitchen, furniture, lighting,
// fixtures) so the two stay easy to cross-check against each other.
// ---------------------------------------------------------------------------

const el = (
  meshName: string,
  name: string,
  category: Element["category"],
  specification: Record<string, string>,
  status: Element["status"],
  responsibleParty: string,
  lastUpdated: string,
): Element => ({ id: `el-${meshName}`, meshName, name, category, specification, status, responsibleParty, lastUpdated });

export const ELEMENTS: Element[] = [
  // --- Envelope ---------------------------------------------------------
  el(
    "building-shell-lower",
    "Existing Building Envelope — Lower",
    "Structural",
    {
      Scope: "Existing structure, retained as-is — not part of interior fit-out scope",
      Note: "Surveyed prior to fit-out commencing; no remedial structural works specified. Any changes here are the base-build contractor's, not ours.",
    },
    "Approved",
    "Hallowell & Vance Construction",
    "2026-06-02",
  ),
  el(
    "building-shell-full",
    "Existing Building Envelope — Full Height",
    "Structural",
    {
      Scope: "Existing structure, retained as-is — not part of interior fit-out scope",
      Note: "As lower envelope. Party wall and floor slab left exposed only where noted on the demolition drawings.",
    },
    "Approved",
    "Hallowell & Vance Construction",
    "2026-06-02",
  ),
  el(
    "floor-lamp",
    "Floor Lamp, Living Area",
    "Lighting",
    {
      Fixture: "Original BTC \"Hector\" floor lamp, brass finish",
      Shade: "Bone china globe diffuser",
      "Colour Temperature": "2700K, dimmable",
      "Lead Time": "3 weeks (stock item, UK supplier)",
    },
    "Approved",
    "Studio Almeida",
    "2026-07-02",
  ),

  // --- Architecture -------------------------------------------------------
  el(
    "accent-wall-panel",
    "Accent Wall Panel, Study",
    "Finish",
    {
      Material: "MDF fluted panelling, 12mm profile depth",
      Finish: "Painted Farrow & Ball No.30 Hague Blue, matte emulsion",
      Installation: "Bonded and pinned to existing wall, joints filled and painted out",
    },
    "Approved",
    "Marchetti Joinery",
    "2026-07-14",
  ),
  el(
    "feature-wall-block-tile",
    "Feature Wall, Kitchen Splashback Return",
    "Finish",
    {
      Material: "Matte ceramic block tile, 100 x 200mm, running bond",
      Grout: "Colour-matched, 2mm joint",
      Note: "Tile reference confirmed on site sample board, not yet cross-checked against supplier batch — flag before ordering full quantity.",
    },
    "For Review",
    "Petrous Stoneworks",
    "2026-08-11",
  ),
  el(
    "interior-wall-painted",
    "Interior Wall, Living Area",
    "Finish",
    {
      Paint: "Farrow & Ball No.286 De Nimes",
      Finish: "Estate Emulsion, matte",
      Prep: "Existing plaster skimmed and mist-coated prior to finish coats",
    },
    "Approved",
    "Finewash Decorators",
    "2026-07-31",
  ),
  el(
    "interior-wall-section",
    "Interior Wall Section, Hallway",
    "Finish",
    {
      Paint: "Farrow & Ball No.9 Off-White",
      Finish: "Estate Emulsion, matte",
    },
    "Approved",
    "Finewash Decorators",
    "2026-07-31",
  ),
  el(
    "facade-wall-flat-panel",
    "Facade Wall, Bedroom",
    "Finish",
    {
      Paint: "Farrow & Ball No.9 Off-White",
      Finish: "Estate Emulsion, matte",
    },
    "Approved",
    "Finewash Decorators",
    "2026-07-31",
  ),
  el(
    "interior-wall-secondary",
    "Interior Wall, Secondary Surface",
    "Finish",
    {
      Paint: "Farrow & Ball No.9 Off-White",
      Finish: "Estate Emulsion, matte",
      Note: "Reverse face of the living area wall — same spec, listed separately as it's a distinct mesh in the model.",
    },
    "Approved",
    "Finewash Decorators",
    "2026-07-31",
  ),
  el(
    "floor",
    "Flooring, Living Area & Hallway",
    "Finish",
    {
      Material: "Havwoods \"Ora\" engineered oak, brushed & UV-oiled",
      Format: "15/4 x 190mm board, random length",
      "Lead Time": "5 weeks ex-works",
    },
    "Approved",
    "Havwoods (supply) / Hallowell & Vance (install)",
    "2026-06-19",
  ),
  el(
    "ceiling-section",
    "Ceiling Bulkhead, Kitchen",
    "Finish",
    {
      Purpose: "Conceals extract ductwork over kitchen run",
      Paint: "Farrow & Ball Ceiling White, matte emulsion",
    },
    "Approved",
    "Finewash Decorators",
    "2026-07-31",
  ),
  el(
    "ceiling",
    "Ceiling, General",
    "Finish",
    {
      Paint: "Farrow & Ball Ceiling White, matte emulsion",
    },
    "Approved",
    "Finewash Decorators",
    "2026-07-31",
  ),
  el(
    "interior-door",
    "Interior Door, Study",
    "Fixture",
    {
      Door: "Solid-core paint-grade door, 44mm, flush",
      Finish: "Painted to match adjacent wall, satin finish",
      Ironmongery: "Corston Architectural Ironmongery, aged brass lever handle, ref. CL-40",
    },
    "Approved",
    "Marchetti Joinery",
    "2026-07-14",
  ),
  el(
    "window-glass-pane",
    "Window Unit, Bedroom",
    "Fixture",
    {
      Glazing: "Double-glazed, low-E coated, argon-filled",
      Frame: "Powder-coated aluminium, RAL 7016 anthracite grey",
    },
    "Approved",
    "Hallowell & Vance Construction",
    "2026-06-02",
  ),
  el(
    "window-glass-pane-large",
    "Window Unit, Living Area (Large)",
    "Fixture",
    {
      Glazing: "Double-glazed, low-E coated, argon-filled",
      Frame: "Powder-coated aluminium, RAL 7016 anthracite grey",
      Note: "Larger sash than the bedroom unit — same spec, confirm opening restrictor is fitted before sign-off (juliet threshold).",
    },
    "For Review",
    "Hallowell & Vance Construction",
    "2026-08-11",
  ),
  el(
    "window-frame-vertical",
    "Window Frame Mullion",
    "Fixture",
    {
      Frame: "Powder-coated aluminium, RAL 7016 anthracite grey, matching window units",
    },
    "Approved",
    "Hallowell & Vance Construction",
    "2026-06-02",
  ),
  el(
    "door-frame-trim",
    "Door Architrave",
    "Finish",
    {
      Profile: "MDF ogee architrave, 70mm",
      Finish: "Paint-grade, painted to match adjacent wall, satin finish",
    },
    "Approved",
    "Marchetti Joinery",
    "2026-07-14",
  ),
  el(
    "baseboard-skirting",
    "Skirting Board, General",
    "Finish",
    {
      Profile: "MDF ogee skirting, 150mm",
      Finish: "Paint-grade, painted gloss finish, matching trim scheme",
    },
    "Approved",
    "Marchetti Joinery",
    "2026-07-14",
  ),
  el(
    "shelf-edge-trim",
    "Shelf Edge Lipping, Bookshelf",
    "Finish",
    {
      Material: "Solid American walnut lipping, matching bookshelf joinery",
      Finish: "Hardwax oil, satin",
    },
    "Approved",
    "Marchetti Joinery",
    "2026-07-14",
  ),
  el(
    "vertical-trim-column",
    "Column Casing, Living Area",
    "Finish",
    {
      Purpose: "Boxes in an existing structural column",
      Material: "Painted MDF casing",
      Finish: "Painted to match adjacent wall, matte emulsion",
    },
    "Approved",
    "Marchetti Joinery",
    "2026-07-14",
  ),

  // --- Kitchen --------------------------------------------------------------
  el(
    "kitchen-countertop",
    "Kitchen Countertop",
    "Finish",
    {
      Material: "Compac \"Absolute Black\" quartz",
      Edge: "20mm pencil edge, honed finish",
      Upstand: "Matching stone upstand, 100mm",
      "Lead Time": "4 weeks (template after cabinetry install)",
    },
    "Approved",
    "Petrous Stoneworks",
    "2026-07-31",
  ),
  el(
    "kitchen-appliances",
    "Kitchen Range",
    "Fixture",
    {
      Oven: "Miele H 2465 B, single oven, PyroFit self-clean",
      Hob: "Miele KM 7375 FL, induction, flush-fit",
      Finish: "Stainless steel / black glass, per manufacturer standard",
      "Lead Time": "6–8 weeks, manufacturer backorder as of last supplier check",
    },
    "Issue",
    "Miele UK (supply) / Hallowell & Vance (install)",
    "2026-08-28",
  ),

  // --- Furniture --------------------------------------------------------
  el(
    "media-console",
    "Media Console, Living Area",
    "Furniture",
    {
      Construction: "Bespoke joinery, American walnut veneer",
      Finish: "Hardwax oil, satin",
      Hardware: "Push-to-open catches, no visible handles",
      "Lead Time": "10 weeks (bespoke)",
    },
    "Approved",
    "Marchetti Joinery",
    "2026-07-14",
  ),
  el(
    "wooden-shelf-decor",
    "Wooden Shelving, Study",
    "Furniture",
    {
      Construction: "Bespoke joinery, American walnut veneer, matching media console",
      Finish: "Hardwax oil, satin",
      "Lead Time": "10 weeks (bespoke)",
    },
    "Approved",
    "Marchetti Joinery",
    "2026-07-14",
  ),
  el(
    "bookshelf",
    "Bookshelf, Study",
    "Furniture",
    {
      Construction: "Bespoke joinery, American walnut veneer, matching media console",
      Finish: "Hardwax oil, satin",
      Styling: "Client to confirm final book/object styling on site before photography",
      "Lead Time": "10 weeks (bespoke)",
    },
    "Revised",
    "Marchetti Joinery",
    "2026-08-28",
  ),
  el(
    "sofa",
    "3-Seat Sofa, Living Area",
    "Furniture",
    {
      Frame: "Bespoke frame, solid ash, pocket-sprung seat deck",
      Upholstery: "Kvadrat \"Hallingdal 65\" wool fabric, colourway 0227",
      Cushions: "Feather-wrapped foam core",
      "Lead Time": "8–10 weeks (reupholstery, colourway change from R02)",
    },
    "For Review",
    "Selvedge & Thread Upholstery",
    "2026-09-08",
  ),
  el(
    "coffee-table-top",
    "Coffee Table, Living Area",
    "Furniture",
    {
      Top: "Compac \"Absolute Black\" quartz, honed finish, matching kitchen counter",
      Base: "Blackened steel, welded frame",
    },
    "Approved",
    "Petrous Stoneworks (top) / local metal fabricator (base)",
    "2026-07-31",
  ),
  el(
    "small-tray-table",
    "Side Table, Living Area",
    "Furniture",
    {
      Note: "Not yet specified — placeholder geometry in the model. Needs a real product selection before this can go out for review.",
    },
    "For Review",
    "Studio Almeida",
    "2026-08-28",
  ),
  el(
    "shelf-counter-ledge",
    "Window Ledge, Kitchen",
    "Finish",
    {
      Material: "Matching stone continuation from kitchen counter",
      Finish: "Honed finish, matching upstand",
    },
    "Approved",
    "Petrous Stoneworks",
    "2026-07-31",
  ),
  el(
    "framed-mirror",
    "Mirror, Hallway",
    "Furniture",
    {
      Frame: "Antiqued brass frame, custom fabrication",
      Glass: "Antique-finish mirror glass",
      "Lead Time": "6 weeks (custom)",
    },
    "Approved",
    "Corston Architectural Metalwork",
    "2026-07-14",
  ),
  el(
    "potted-plant",
    "Potted Plant, Living Area",
    "Furniture",
    {
      Note: "Loose furnishing, sourced and placed on installation day, not a specified line item — species/pot to be confirmed with the plant supplier closer to move-in.",
    },
    "For Review",
    "Studio Almeida",
    "2026-08-28",
  ),
  el(
    "area-rug",
    "Area Rug, Living Area",
    "Furniture",
    {
      Construction: "Hand-knotted, wool and silk blend",
      Supplier: "Christopher Farr Rug Collection, custom size",
      "Lead Time": "12–16 weeks (hand-knotted, custom)",
    },
    "Approved",
    "Christopher Farr",
    "2026-09-08",
  ),

  // --- Lighting & curtains --------------------------------------------------
  el(
    "curtain-panel",
    "Curtain Panel, Living Area",
    "Furniture",
    {
      Fabric: "Heavyweight linen, colour Flax",
      Heading: "Wave heading, motorised track",
      "Lead Time": "6–8 weeks (fabrication)",
    },
    "Approved",
    "Selvedge & Thread Upholstery",
    "2026-07-31",
  ),
  el(
    "curtain-tieback-cord",
    "Curtain Tieback, Living Area",
    "Furniture",
    {
      Material: "Twisted linen cord, colour-matched to curtain fabric",
    },
    "Approved",
    "Selvedge & Thread Upholstery",
    "2026-07-31",
  ),
  el(
    "curtain-panel-sheer",
    "Sheer Curtain, Living Area",
    "Furniture",
    {
      Fabric: "Linen voile, undyed",
      Heading: "Wave heading, layered behind main curtain track",
      "Lead Time": "6–8 weeks (fabrication)",
    },
    "Approved",
    "Selvedge & Thread Upholstery",
    "2026-07-31",
  ),
  el(
    "lamp-shade",
    "Table Lamp Shade, Living Area",
    "Lighting",
    {
      Shade: "Hand-sewn linen drum shade",
      Pairs: "With turned-brass lamp base (see Table Lamp Base)",
    },
    "Approved",
    "Studio Almeida",
    "2026-07-14",
  ),
  el(
    "table-lamp-base",
    "Table Lamp Base, Living Area",
    "Lighting",
    {
      Fixture: "Original BTC turned-brass table lamp base",
      "Colour Temperature": "2700K, dimmable",
      "Lead Time": "3 weeks (stock item)",
      Note: "Console position under review — see open annotation before finalising socket/switch rough-in location.",
    },
    "For Review",
    "Studio Almeida",
    "2026-09-08",
  ),

  // --- Small fixtures and hardware -------------------------------------------
  el(
    "cabinet-handle",
    "Cabinet Handle, Kitchen",
    "Fixture",
    {
      Product: "Corston Architectural Ironmongery, bar handle, aged brass, ref. BH-220",
    },
    "Approved",
    "Corston Architectural Ironmongery",
    "2026-07-31",
  ),
  el(
    "cabinet-knob-1",
    "Cabinet Knob, Kitchen",
    "Fixture",
    {
      Product: "Corston Architectural Ironmongery, knurled knob, aged brass, ref. CK-114",
    },
    "Approved",
    "Corston Architectural Ironmongery",
    "2026-07-31",
  ),
  el(
    "door-cabinet-handle",
    "Door / Cabinet Handle, Study",
    "Fixture",
    {
      Product: "Corston Architectural Ironmongery, lever handle, aged brass, ref. CL-40, matching study door",
    },
    "Approved",
    "Corston Architectural Ironmongery",
    "2026-07-14",
  ),
  el(
    "small-wall-fixture",
    "Small Wall Fixture, Hallway",
    "Fixture",
    {
      Note: "Not confidently identifiable from the model geometry alone — likely a switch plate or a small sconce backplate, but this hasn't been confirmed on site. Do not order against this line until it's been walked with the electrician.",
    },
    "For Review",
    "Studio Almeida",
    "2026-08-11",
  ),
  el(
    "cabinet-knob-2",
    "Cabinet Knob, Study Shelving",
    "Fixture",
    {
      Product: "Corston Architectural Ironmongery, knurled knob, aged brass, ref. CK-114, matching kitchen",
    },
    "Approved",
    "Corston Architectural Ironmongery",
    "2026-07-14",
  ),
  el(
    "decorative-object",
    "Decorative Object, Bookshelf",
    "Furniture",
    {
      Note: "Loose styling item, not a specified line — placeholder for whatever the client places here. Not part of the FF&E budget.",
    },
    "For Review",
    "Studio Almeida",
    "2026-08-28",
  ),
];

// ---------------------------------------------------------------------------
// Annotations — four genuine-sounding review comments, pinned to real
// elements at their actual measured positions in the model.
// ---------------------------------------------------------------------------

export const ANNOTATIONS: Annotation[] = [
  {
    id: "an-01",
    elementId: "el-sofa",
    position: [-8312, 352, -4518],
    normal: [0.3, 0.7, 0.65],
    author: "R. Voss (Client)",
    body:
      "The velvet swatch you sent reads navy on my laptop screen but almost black in the living room in the afternoon. Before this goes to the upholsterer can we get an actual cutting pinned up against the rug in the room itself? I don't want to pay for reupholstery twice.",
    createdAt: "2026-09-08",
    status: "Open",
    replies: [
      {
        id: "an-01-r1",
        author: "M. Almeida (Studio Almeida)",
        body:
          "Fair — screens are lying to you here. I'll bring the actual bolt over Thursday and we'll hold it against the rug in daylight before it goes to Selvedge & Thread. Holding the cutting order until then.",
        createdAt: "2026-09-09",
      },
    ],
  },
  {
    id: "an-02",
    elementId: "el-table-lamp-base",
    position: [-6867, 644, -4804],
    normal: [0, 1, 0.2],
    author: "M. Almeida (Studio Almeida)",
    body:
      "Lamp is reading too far into the walkway from the hallway side — anyone coming round the console at night is going to clip the shade. Pull the console 150mm off the wall and re-centre the lamp before electrical rough-in locks the socket position, otherwise we're stuck with it.",
    createdAt: "2026-09-08",
    status: "Open",
    replies: [],
  },
  {
    id: "an-03",
    elementId: "el-kitchen-appliances",
    position: [-8361, 534, -4518],
    normal: [0, 0.4, 1],
    author: "R. Voss (Client)",
    body:
      "Six to eight weeks on the range is a problem if we're still aiming to move in end of quarter. Is there a floor model or a different colour Miele has in stock now that we could take instead, even if it's not the exact spec?",
    createdAt: "2026-08-28",
    status: "Open",
    replies: [],
  },
  {
    id: "an-04",
    elementId: "el-area-rug",
    position: [-8296, 97, -4634],
    normal: [0, 1, 0],
    author: "M. Almeida (Studio Almeida)",
    body:
      "Rug sample confirmed against the oak flooring in actual daylight this morning — no ghosting against the sofa fabric direction we're holding, and the wool-silk sheen isn't fighting the coffee table top. Approving as specified.",
    createdAt: "2026-09-08",
    status: "Resolved",
    replies: [],
  },
];

// ---------------------------------------------------------------------------
// Revisions
// ---------------------------------------------------------------------------

export const REVISIONS: Revision[] = [
  {
    id: "rev-01",
    label: "R01",
    date: "2026-06-19",
    summary:
      "Design Development set issued for client review. Kitchen and living area finishes (flooring, counter stone, appliance selection) locked; soft furnishings and lighting still pending fabric and fixture selection.",
    changedElementIds: ["el-floor", "el-kitchen-countertop", "el-kitchen-appliances", "el-interior-wall-painted"],
  },
  {
    id: "rev-02",
    label: "R02",
    date: "2026-07-31",
    summary:
      "Wall paint scheme finalised across all rooms (Farrow & Ball, matte throughout). Curtain and sheer fabrics selected and sent for fabrication. Bespoke joinery (media console, shelving, bookshelf) confirmed in American walnut.",
    changedElementIds: [
      "el-interior-wall-painted",
      "el-interior-wall-section",
      "el-facade-wall-flat-panel",
      "el-curtain-panel",
      "el-curtain-panel-sheer",
      "el-media-console",
      "el-bookshelf",
    ],
  },
  {
    id: "rev-03",
    label: "R03",
    date: "2026-08-28",
    summary:
      "Issued for Client Review. Rug and sofa fabric direction under final confirmation against daylight samples; bookshelf styling revised pending client sign-off; kitchen appliance delivery flagged as a lead-time issue against the move-in date.",
    changedElementIds: ["el-area-rug", "el-sofa", "el-bookshelf", "el-kitchen-appliances", "el-table-lamp-base"],
  },
];
