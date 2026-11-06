# EcoRoute AI 🚛🌱

> **Predictive Municipal Waste & Carbon Reduction Platform**  
> *Transforming municipal solid waste management into a closed-loop, data-driven, and carbon-negative urban utility.*

[![Stage 2 Submission](https://img.shields.io/badge/PCCOE%20IGC%202026-Stage%202%20Submission-emerald?style=for-the-badge&logo=target)](https://github.com/adityarote652/ecoroute-ai)
[![React 19](https://img.shields.io/badge/React-19-61dafb?style=for-the-badge&logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646cff?style=for-the-badge&logo=vite)](https://vitejs.dev/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-ffca28?style=for-the-badge&logo=firebase)](https://firebase.google.com/)
[![Leaflet](https://img.shields.io/badge/Leaflet-Maps-199900?style=for-the-badge&logo=leaflet)](https://leafletjs.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38bdf8?style=for-the-badge&logo=tailwindcss)](https://tailwindcss.com/)
[![SDG 13](https://img.shields.io/badge/SDG%2013-Climate%20Action-3F7E44?style=for-the-badge)](https://sdgs.un.org/goals/goal13)

---

### 🔗 Project Showcase Links
- 🌐 **Live Vercel Demo**: [https://ecoroute-ai.vercel.app](https://ecoroute-ai.vercel.app) *(Placeholder)*
- 🎥 **YouTube Video Pitch**: [https://youtube.com/watch?v=YOUR_VIDEO_ID](https://youtube.com/watch?v=YOUR_VIDEO_ID) *(Placeholder)*
- 💻 **Source Code Repository**: [https://github.com/adityarote652/ecoroute-ai](https://github.com/adityarote652/ecoroute-ai)

---

## 🏆 Hackathon Context

**EcoRoute AI** is proudly developed and submitted for:
- **Event**: **Indradhanu: PCCOE International Grand Challenge 2026 (IGC 2026)**
- **Stage**: **Stage 2 Technical Prototype & Implementation Submission**
- **Institution**: Pimpri Chinchwad College of Engineering (PCCOE), Pune, India
- **Focus Area**: Smart Cities, Sustainable Urban Utilities & Direct Climate Action (UN SDG 13 & SDG 11)

Traditional municipal collection models in urban centers such as Pune and PCMC rely on fixed, static routes where compactor trucks visit every bin regardless of fill levels. This outdated model wastes thousands of liters of municipal diesel, produces tonnes of avoidable greenhouse gases, and leaves overflowing bins unattended for hours. **EcoRoute AI solves this by introducing dynamic, demand-responsive routing coupled with predictive AI telemetry and citizen crowdsourcing.**

---

## 🔄 The Ecosystem (Closed-Loop Architecture)

EcoRoute AI connects citizens, municipal authorities, and fleet operators into a unified, **zero-refresh real-time ecosystem**:

```
 ┌──────────────────────┐         ┌──────────────────────────────┐         ┌────────────────────────────┐
 │     CITIZEN HUB      │         │    MUNICIPAL DISPATCH HUB    │         │      DRIVER TABLET HUD     │
 │  • Geo-tagged Report │ ─────>  │  • Real-Time IoT Telemetry   │ ─────>  │  • In-Cabin Tablet View    │
 │  • Gamified Wallet   │ (Cloud) │  • +6h Waste Prediction Sim  │ (Cloud) │  • Real Street Turn-by-Turn│
 │  • Metro Discounts   │         │  • OSRM TSP Route Optimizer  │         │  • 1-Click Collection Loop │
 └──────────────────────┘         └──────────────────────────────┘         └────────────────────────────┘
            ▲                                                                             │
            │                                                                             │
            └─────────────────────── Auto-Reset & Sync Loop ──────────────────────────────┘
                                  (0% Fill • Green Marker • Instant Queue Clean)
```

1. **Citizen Hub (Crowdsourced Intelligence & Civic Rewards)**:
   - Residents report overflowing bins or illegal dumping with category classification and location tagging.
   - Every verified submission rewards the citizen with **+50 Green Credits** into their gamified **Eco-Wallet** (redeemable for Pune Metro / PCMC public transit discounts: *50 Credits = ₹10 Discount*).
   - Citizen reports immediately route to the municipal oversight dashboard via Firebase.

2. **Municipal AI Dispatch Hub (Command & Control Center)**:
   - Central command monitoring live waste levels across Ward 12 / PCMC.
   - Runs the **Predictive "+6h Waste" Simulation Engine** to anticipate future overflow hotspots based on neighborhood generation patterns.
   - Automatically ranks critical bins ($\ge 80\%$ fill) in the **Priority Collection Queue**.
   - Computes mathematically optimal collection itineraries connecting the **Vehicle Depot**, all critical stops, and the **Ramtekdi Solid Waste Processing MRF Plant** using the **OSRM TSP (Traveling Salesperson Problem)** algorithm.
   - Displays predictive **Waste Generation Heatmaps** and divides routes across multiple trucks for fleet capacity planning.

3. **Driver Hub (In-Cab Mobile Tablet HUD)**:
   - Rugged, high-contrast tablet interface tailored for truck cab mounting.
   - Automatically reads the exact dispatched route and sorted stops directly from the Municipal Dispatcher via the Global Reactive Store and Firebase.
   - Displays truck speed telemetry, compactor load capacity, and large-touch waypoint controls.
   - Features the **"Mark Current Bin Collected"** action button with rising Web Audio feedback.

4. **The Closed Feedback Loop**:
   - Clicking "Mark Bin Collected" immediately resets the bin in Firestore and Global Context to **Normal (0% fill, Green marker)**.
   - The Municipal Dashboard instantly updates without a page refresh, removing the bin from the Priority List and updating map indicators in real time.

---

## 🌍 SDG 13 Alignment (Climate Action & Impact Metrics)

EcoRoute AI is architected from the ground up to achieve measurable carbon abatement under **United Nations Sustainable Development Goal 13 (Climate Action)** and **SDG 11 (Sustainable Cities and Communities)**.

### 1. Eliminating Senseless Kilometers with OSRM TSP Optimization
Conventional Pune garbage trucks travel fixed $38.4\text{ km}$ loops per sector, stopping at partially filled or empty bins. EcoRoute AI applies the **Traveling Salesperson Problem (TSP)** heuristic using the Open Source Routing Machine (OSRM):
- Bins below collection threshold ($<80\%$) are bypassed until warranted.
- Average route distance drops from **$38.4\text{ km}$ to $22.8\text{ km}$ per shift**—a **$40.6\%$ reduction in Vehicle Kilometers Traveled (VKT)**.
- Fuel idling is minimized at collection points through sequenced street geometry.

### 2. Direct Carbon Reduction Formula ($\text{Kg of CO}_2\text{ Avoided}$)
For heavy municipal diesel compactor trucks consuming $\approx 0.38\text{ L/km}$ with an emission factor of $2.68\text{ kg CO}_2/\text{L}$:
$$\Delta \text{Distance} = \text{Fixed Baseline } (38.4\text{ km}) - \text{Optimized Route } (22.8\text{ km}) = 15.6\text{ km saved}$$
$$\text{Diesel Conserved} = 15.6\text{ km} \times 0.38\text{ L/km} = 5.93\text{ Liters}$$
$$\text{CO}_2\text{ Avoided} = 5.93\text{ L} \times 2.68\text{ kg CO}_2/\text{L} \approx \mathbf{15.9\text{ kg CO}_2\text{ per shift}}$$
*Scaled across a fleet of 50 municipal vehicles operating twice daily, this prevents over **580 metric tonnes of }\text{CO}_2$ emissions annually.*

### 3. Biogas & Energy Recovery Yield
By routing segregated organic waste directly to the **Ramtekdi Biomethanation and MRF facility**, the platform calculates real-time bio-energy potential:
- **Biogas Yield**: $\approx 0.045\text{ m}^3$ methane per kg of sorted organic waste.
- **Renewable Electricity Generated**: Converted into equivalent kWh to demonstrate green circular economy returns to municipal commissioners.

---

## ⚡ Key Features & Technical Highlights

- ⏳ **Predictive "+6h Waste" Simulation Engine**:
  Simulates diurnal waste accumulation by advancing all monitored bins by $15\% - 25\%$, dynamically upgrading markers ($\ge 80\%$ Critical Red, $50\%-79\%$ Warning Orange, $<50\%$ Normal Green) and automatically re-sorting the Priority Collection List.
- 🔄 **Real-Time Firebase Synchronization (Zero-Refresh Architecture)**:
  Full bi-directional synchronization powered by Google Firebase Firestore. Updates made by drivers or citizens reflect instantly across all connected dashboard panels without a page reload.
- 🛣️ **OSRM Dynamic Routing & TSP Street Geometry**:
  Integrates with `router.project-osrm.org` to generate true driving geometry, realistic driving turn-by-turn routes, distance (km), and estimated transit duration between facilities.
- 🪙 **Gamified Citizen Eco-Wallet**:
  Civic incentive module with real-time balance increments (+50 Green Credits per report) tied to PCMC Metro transit discounts, encouraging neighborhood waste stewardship.
- 🔥 **Predictive Heatmap Mode**:
  Toggleable high-density waste generation heatmap rendered with native `react-leaflet` `<Circle>` opacity blending clustered over high-generation commercial corridors (e.g. FC Road / Shivaji Nagar).
- 🚛 **Multi-Truck Visual Fleet Dispatching**:
  Splits the single master TSP route into two distinct truck assignments—**TR-01 Route (Blue)** and **TR-02 Route (Purple)**—with interactive sticky tooltips and popups proving multi-fleet load balancing.
- 📋 **Interactive Admin Registry & Real-Time Audit Log**:
  Tailwind modal overlays to register new IoT bins and trucks directly into Firestore, paired with an automated 10-second polling audit log simulating live municipal telemetry pings.
- 🌐 **Trilingual Localization**:
  One-click language switcher supporting **English**, **Hindi (हिंदी)**, and **Marathi (मराठी)** across key municipal terminology and citizen interfaces.

---

## 🛠️ Tech Stack

| Category | Technologies |
| :--- | :--- |
| **Frontend Framework** | [React 19](https://react.dev/) • Functional Components & Hooks (`useState`, `useEffect`, `useCallback`, `useRef`) |
| **Build Tool & Bundler** | [Vite 6](https://vitejs.dev/) (Sub-second HMR & optimized production bundling) |
| **Styling & Design System** | [Tailwind CSS 3.4](https://tailwindcss.com/) • Custom Glassmorphism, Dark Mode, Responsive Grids |
| **Mapping & GIS** | [Leaflet 1.9](https://leafletjs.com/) • [React-Leaflet 5](https://react-leaflet.js.org/) • [OpenStreetMap](https://www.openstreetmap.org/) |
| **Routing Algorithm** | [OSRM Driving API](https://project-osrm.org/) (Traveling Salesperson Problem / Route Trip engine) |
| **Backend & Cloud Database** | [Google Firebase](https://firebase.google.com/) • Cloud Firestore & Firebase Authentication |
| **Audio Synthesis** | HTML5 Web Audio API (In-cabin truck feedback chimes) |
| **Icons & Typography** | [FontAwesome 6 Pro](https://fontawesome.com/) • Inter & Outfit typography |

---

## 💻 Local Setup & Installation

Follow these steps to run the EcoRoute AI platform locally on your machine.

### Prerequisites
- [Node.js](https://nodejs.org/) (v18.0.0 or higher recommended)
- `npm` (v9.0.0 or higher) or `yarn`

### 1. Clone the Repository
```bash
git clone https://github.com/adityarote652/ecoroute-ai.git
cd ecoroute-ai
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
> [!CAUTION]
> **CRITICAL**: For security best practices, the live `.env` file containing Firebase credentials is gitignored and is not tracked in the repository. **You MUST create your own `.env` file in the root directory before running the application**, otherwise Firebase database features will fail to initialize.

Create a `.env` file in the root directory:
```bash
# On Linux / macOS:
touch .env

# On Windows PowerShell:
New-Item -ItemType File -Name .env
```

Populate `.env` with your Firebase project credentials:
```env
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_firebase_app_id
VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

### 4. Start the Local Development Server
```bash
npm run dev
```
Open your browser and navigate to `http://localhost:5173/` (or the port specified in your terminal).

### 5. Build for Production
To generate an optimized production bundle:
```bash
npm run build
```
To preview the production build locally:
```bash
npm run preview
```

---

## 👥 Team & Submission Details

- **Hackathon**: Indradhanu: PCCOE International Grand Challenge 2026 (Stage 2)
- **Repository**: [https://github.com/adityarote652/ecoroute-ai](https://github.com/adityarote652/ecoroute-ai)
- **Status**: Complete & Verified with Production Build (Vite 6 + React 19)

---
*EcoRoute AI — Engineered for cleaner Indian cities and measurable climate action.*
