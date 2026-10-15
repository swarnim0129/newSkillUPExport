const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./config/db");

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Middleware
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map(o => o.trim())
  : ["http://localhost:3000", "https://seeker-website-kappa.vercel.app", "https://seeker.works","https://unglamourously-undancing-miracle.ngrok-free.dev","http://192.168.0.104:3000"];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json());

// Serve uploaded files statically
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/admin/auth", require("./routes/adminAuthRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/onboarding", require("./routes/onboardingRoutes"));
app.use("/api/resume", require("./routes/resumeRoutes"));
app.use("/api/resumes", require("./routes/resumeBuilderRoutes"));
app.use("/api/candidate", require("./routes/candidateRoutes"));
app.use("/api/interview", require("./routes/interviewRoutes"));
app.use("/api/reviews", require("./routes/reviewRoutes"));
app.use("/api/roadmap", require("./routes/roadmapRoutes"));
app.use("/api/gamification", require("./routes/gamificationRoutes"));
app.use("/api/journey", require("./routes/journeyRoutes"));
app.use("/api/practice", require("./routes/practiceRoutes"));
app.use("/api/mentor", require("./routes/mentorRoutes"));
app.use("/api/classes", require("./routes/classRoutes"));
app.use("/api/grow", require("./routes/growRoutes"));
// Public, no sign-in: a student's shared skill passport
app.get("/api/public/passport/:handle", require("./controllers/growController").publicPassport);
app.use("/api/creator", require("./routes/creatorRoutes"));
app.use("/api/creator-profile", require("./routes/creatorProfileRoutes"));
app.use("/api/courses", require("./routes/courseInteractionRoutes"));

// Public browse endpoint – returns all published courses (no auth required)
app.get("/api/courses/browse", async (req, res) => {
  try {
    const Course = require("./models/Course");
    const { category, search, sort } = req.query;

    const filter = { status: { $in: ["published", "draft"] } };
    if (category && category !== "All") filter.category = category;
    if (search) filter.$text = { $search: search };

    let sortOption = { createdAt: -1 };
    if (sort === "popular") sortOption = { total_enrollments: -1 };
    if (sort === "rating") sortOption = { "rating.average": -1 };

    const courses = await Course.find(filter)
      .populate("creator", "displayName username avatar_url clerkId")
      .populate({
        path: "videos",
        select: "title duration_seconds thumbnail_url order_index cloudinary_url",
        options: { sort: { order_index: 1 } },
      })
      .sort(sortOption)
      .lean();

    res.json({ success: true, courses });
  } catch (error) {
    console.error("Browse courses error:", error);
    res.status(500).json({ error: "Failed to fetch courses" });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "SkillUp API is running" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res
    .status(500)
    .json({ message: "Something went wrong!", error: err.message });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // ── Keep-alive self-ping (prevents Render free tier from sleeping) ──
  if (process.env.RENDER_EXTERNAL_URL) {
    const PING_INTERVAL = 13 * 60 * 1000; // 10 minutes
    setInterval(async () => {
      try {
        const res = await fetch(`${process.env.RENDER_EXTERNAL_URL}/api/health`);
        console.log(`[Keep-alive] Pinged health → ${res.status}`);
      } catch (err) {
        console.error("[Keep-alive] Ping failed:", err.message);
      }
    }, PING_INTERVAL);
    console.log("[Keep-alive] Self-ping enabled every 14 minutes");
  }
});
