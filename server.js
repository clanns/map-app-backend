const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// 初始化Express应用
const app = express();

// ================= 安全中间件配置 =================
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// 请求速率限制（每个IP每分钟100次）
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1分钟
  max: 100,
  message: {
    code: 429,
    message: '请求过于频繁，请稍后再试'
  }
});
app.use(limiter);

// 请求体大小限制为10KB
app.use(express.json({ limit: '10kb' }));

// ================= 数据库连接 =================
const DB_URI = process.env.MONGODB_URI;

mongoose.connect(DB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  retryWrites: true,
  w: 'majority'
})
.then(() => console.log('✅ MongoDB连接成功'))
.catch(err => {
  console.error('❌ 数据库连接失败:', err.message);
  process.exit(1);
});

// ================= 数据模型 =================
const markerSchema = new mongoose.Schema({
  position: {
    lat: { 
      type: Number, 
      required: [true, '纬度不能为空'],
      min: [-90, '纬度不能小于-90'],
      max: [90, '纬度不能大于90']
    },
    lng: { 
      type: Number, 
      required: [true, '经度不能为空'],
      min: [-180, '经度不能小于-180'],
      max: [180, '经度不能大于180']
    }
  },
  content: {
    type: String,
    required: [true, '标注内容不能为空'],
    trim: true,
    minlength: [1, '内容至少需要1个字符'],
    maxlength: [200, '内容不能超过200个字符']
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: true 
  }
});

// 创建复合索引
markerSchema.index({ 'position.lat': 1, 'position.lng': 1 }, { unique: true });

const Marker = mongoose.model('Marker', markerSchema);

// ================= API端点 =================
/**
 * @swagger
 * /markers:
 *   get:
 *     summary: 获取所有标注
 *     responses:
 *       200:
 *         description: 成功获取标注列表
 */
app.get('/markers', async (req, res) => {
  try {
    const markers = await Marker.find().sort('-createdAt');
    res.json({ status: 'success', data: markers });
  } catch (err) {
    res.status(500).json({ 
      status: 'error',
      message: '获取数据失败'
    });
  }
});

/**
 * @swagger
 * /markers:
 *   post:
 *     summary: 创建新标注
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               lat:
 *                 type: number
 *               lng:
 *                 type: number
 *               content:
 *                 type: string
 *     responses:
 *       201:
 *         description: 标注创建成功
 */
app.post('/markers', async (req, res) => {
  try {
    const { lat, lng, content } = req.body;
    
    const newMarker = await Marker.create({
      position: { lat, lng },
      content
    });

    res.status(201).json({
      status: 'success',
      data: newMarker
    });
  } catch (err) {
    res.status(400).json({
      status: 'fail',
      message: err.message
    });
  }
});

// ================= 启动服务 =================
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`🚀 服务已启动，端口：${PORT}`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('🛑 收到关闭信号，正在清理资源...');
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log('✅ 服务已安全关闭');
      process.exit(0);
    });
  });
});
