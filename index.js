const express = require("express");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient({
  log: ["query", "info", "warn", "error"],
});

const app = express();

app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.send("API працює!");
});
prisma.$use(async (params, next) => {
  console.log("Running query:", params.model, params.action);
  console.log("Params:", JSON.stringify(params.args, null, 2));
  const result = await next(params);
  return result;
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущено на порті ${PORT}`);
});

app.get("/analytics/top-discounts", async (req, res) => {
  try {
    const discounts = await prisma.discount.findMany({
      include: {
        orders: true,
      },
    });

    const stats = discounts.map((d) => {
      const count = d.orders.length;
      const total = d.orders.reduce(
        (sum, o) => sum + Number(o.total_amount || 0),
        0
      );
      const avg = count ? total / count : 0;

      return {
        id: d.id,
        name: d.name,
        usage_count: count,
        total_sales: total,
        average_order: avg,
        rate: d.discount_rate,
      };
    });

    stats.sort((a, b) => b.total_sales - a.total_sales);

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/customers", async (req, res) => {
  const customers = await prisma.customer.findMany();
  res.json(customers);
});

app.get("/products", async (req, res) => {
  const products = await prisma.product.findMany();

  const formatted = products.map((p) => ({
    ...p,
    price: p.price ? parseFloat(p.price) : null,
  }));

  res.json(formatted);
});

app.get("/analytics/popular-products", async (req, res) => {
  try {
    const popular = await prisma.orderDetail.groupBy({
      by: ["product_id"],
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 10,
    });

    const productIds = popular.map((item) => item.product_id);

    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    const result = popular.map((item) => {
      const product = products.find((p) => p.id === item.product_id);
      return {
        id: product?.id,
        name: product?.name || "Unknown",
        count: item._sum.quantity || 0,
      };
    });

    res.json(result);
  } catch (error) {
    console.error("Forecast error:", error);
    res.status(500).json({ error: "Failed to forecast popular products" });
  }
});

app.get("/orders", async (req, res) => {
  const orders = await prisma.order.findMany();

  const formatted = orders.map((order) => ({
    ...order,
    total_amount: order.total_amount ? parseFloat(order.total_amount) : null,
  }));

  res.json(formatted);
});

app.get("/business_clients", async (req, res) => {
  const clients = await prisma.businessClient.findMany();
  res.json(clients);
});

app.get("/discounts", async (req, res) => {
  const discounts = await prisma.discount.findMany();

  const formatted = discounts.map((d) => ({
    ...d,
    discount_rate: d.discount_rate ? parseFloat(d.discount_rate) : null,
  }));

  res.json(formatted);
});

app.get("/order_details", async (req, res) => {
  const details = await prisma.orderDetail.findMany();

  const formatted = details.map((d) => ({
    ...d,
    unit_price: d.unit_price ? parseFloat(d.unit_price) : null,
  }));

  res.json(formatted);
});
app.get("/orders/:id/details", async (req, res) => {
  try {
    const orderId = parseInt(req.params.id);

    const details = await prisma.orderDetail.findMany({
      where: { order_id: orderId },
      include: { product: true },
    });

    const response = details.map((detail, index) => ({
      id: index + 1,
      productName: detail.product.name,
      quantity: detail.quantity,
      unitPrice: parseFloat(detail.unit_price),
      totalPrice: parseFloat((detail.quantity * detail.unit_price).toFixed(2)),
    }));

    res.json(response);
  } catch (error) {
    console.error("Error fetching order details:", error);
    res.status(500).json({ error: "Failed to fetch order details" });
  }
});

app.get("/campaigns", async (req, res) => {
  const campaigns = await prisma.marketingCampaign.findMany();

  const formatted = campaigns.map((c) => ({
    ...c,
    budget: c.budget ? parseFloat(c.budget) : null,
  }));

  res.json(formatted);
});

app.get("/engagements", async (req, res) => {
  const engagements = await prisma.customerEngagement.findMany();
  res.json(engagements);
});

app.get("/recommendations", async (req, res) => {
  const recommendations = await prisma.recommendation.findMany();
  res.json(recommendations);
});

app.get("/users", async (req, res) => {
  const users = await prisma.user.findMany();
  res.json(users);
});
app.post("/discounts", async (req, res) => {
  try {
    const { name, discount_rate, valid_from, valid_until } = req.body;

    const newDiscount = await prisma.discount.create({
      data: {
        name,
        discount_rate: parseFloat(discount_rate),
        valid_from: new Date(valid_from),
        valid_until: new Date(valid_until),
      },
    });

    res.status(201).json(newDiscount);
  } catch (error) {
    console.error("Error creating discount:", error);
    res.status(500).json({ error: "Failed to create discount" });
  }
});
const { Parser } = require("json2csv");

app.get("/products/export/csv", async (req, res) => {
  try {
    const products = await prisma.product.findMany();

    const fields = ["id", "name", "category", "price", "created_at"];
    const opts = { fields };
    const parser = new Parser(opts);
    const csv = parser.parse(products);

    res.header("Content-Type", "text/csv");
    res.attachment("products.csv");
    return res.send(csv);
  } catch (err) {
    console.error("CSV export error:", err);
    res.status(500).json({ error: "Failed to export CSV" });
  }
});
app.get("/analytics/rfm-analysis", async (req, res) => {
  try {
    const customers = await prisma.customer.findMany({
      include: {
        orders: true,
      },
    });

    const now = new Date();

    const result = customers.map((c) => {
      const orders = c.orders || [];
      const recency =
        orders.length > 0
          ? Math.floor(
              (now - new Date(orders.at(-1).order_date)) / (1000 * 60 * 60 * 24)
            )
          : 999;

      const frequency = orders.length;
      const monetary = orders.reduce((sum, o) => {
        return sum + parseFloat(o.total_amount ?? 0);
      }, 0);

      let segment = "Low";
      if (recency < 30 && frequency >= 3 && monetary >= 300) segment = "High";
      else if (frequency >= 2 && monetary >= 150) segment = "Medium";

      return {
        id: c.id, // для Swift decoding
        customer_id: c.id,
        recency,
        frequency,
        monetary,
        segment,
      };
    });

    res.json(result);
  } catch (error) {
    console.error("RFM Error:", error);
    res.status(500).json({ error: "Failed to calculate RFM" });
  }
});

app.get("/analytics/marketing-campaigns", async (req, res) => {
  const campaigns = await prisma.marketingCampaign.findMany();
  res.json(campaigns);
});

app.get("/analytics/recommendations", async (req, res) => {
  const recommendations = await prisma.recommendation.findMany();
  res.json(recommendations);
});

app.get("/analytics/customer-growth", async (req, res) => {
  try {
    const customers = await prisma.customer.findMany();
    const growthMap = {};

    customers.forEach((customer) => {
      const month = customer.registered_at.toISOString().slice(0, 7); // YYYY-MM
      growthMap[month] = (growthMap[month] || 0) + 1;
    });

    const result = Object.entries(growthMap)
      .map(([month, count]) => ({
        month,
        count,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    res.json(result);
  } catch (err) {
    console.error("Error fetching customer growth:", err);
    res.status(500).json({ error: "Failed to get customer growth" });
  }
});

app.get("/analytics/customer-growth", async (req, res) => {
  try {
    const growth = await prisma.customer.groupBy({
      by: ["registered_at"],
      _count: { _all: true },
    });

    const grouped = {};

    growth.forEach((entry) => {
      const month = entry.registered_at.toISOString().slice(0, 7); // YYYY-MM
      grouped[month] = (grouped[month] || 0) + entry._count._all;
    });

    const result = Object.entries(grouped)
      .map(([month, count]) => ({ month, count }))
      .sort((a, b) => a.month.localeCompare(b.month));

    res.json(result);
  } catch (err) {
    console.error("Customer growth error:", err);
    res.status(500).json({ error: "Failed to fetch growth" });
  }
});

app.get("/analytics/age-distribution", async (req, res) => {
  try {
    const customers = await prisma.customer.findMany({
      select: { date_of_birth: true },
    });

    const now = new Date();
    const groups = {
      "18-25": 0,
      "26-35": 0,
      "36-50": 0,
      "51+": 0,
      Unknown: 0,
    };

    customers.forEach((c) => {
      if (!c.date_of_birth) {
        groups["Unknown"]++;
        return;
      }

      const age = now.getFullYear() - new Date(c.date_of_birth).getFullYear();
      if (age >= 18 && age <= 25) groups["18-25"]++;
      else if (age <= 35) groups["26-35"]++;
      else if (age <= 50) groups["36-50"]++;
      else groups["51+"]++;
    });

    res.json(
      Object.entries(groups).map(([range, count]) => ({ range, count }))
    );
  } catch (err) {
    console.error("Age distribution error:", err);
    res.status(500).json({ error: "Failed to fetch age distribution" });
  }
});

app.post("/campaigns", async (req, res) => {
  try {
    const {
      businessClientId,
      campaignName,
      startDate,
      endDate,
      budget,
      channel,
    } = req.body;

    const newCampaign = await prisma.marketingCampaign.create({
      data: {
        business_client_id: businessClientId,
        campaign_name: campaignName,
        start_date: new Date(startDate),
        end_date: new Date(endDate),
        budget: parseFloat(budget),
        channel: channel,
      },
    });

    res.status(201).json(newCampaign);
  } catch (error) {
    console.error("Error creating campaign:", error);
    res.status(500).json({ error: "Failed to create campaign" });
  }
});
