import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 シードデータ投入開始...");

  // 管理者ユーザー作成
  const adminPassword = await bcrypt.hash("admin123", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      name: "管理者",
      passwordHash: adminPassword,
      role: Role.ADMIN,
    },
  });
  console.log(`✅ 管理者作成: ${admin.email}`);

  // マネージャーユーザー
  const managerPassword = await bcrypt.hash("manager123", 12);
  const manager = await prisma.user.upsert({
    where: { email: "manager@example.com" },
    update: {},
    create: {
      email: "manager@example.com",
      name: "佐藤マネージャー",
      passwordHash: managerPassword,
      role: Role.MANAGER,
    },
  });

  // メンバーユーザー
  const memberPassword = await bcrypt.hash("member123", 12);
  const member = await prisma.user.upsert({
    where: { email: "member@example.com" },
    update: {},
    create: {
      email: "member@example.com",
      name: "田中メンバー",
      passwordHash: memberPassword,
      role: Role.MEMBER,
    },
  });

  // 事業データ (サンプル5事業)
  const businesses = await Promise.all([
    prisma.business.upsert({
      where: { code: "ad" },
      update: {},
      create: { name: "広告運用事業", code: "ad", description: "リスティング広告・SNS広告の運用代行", managerId: manager.id, colorCode: "#3B82F6", sortOrder: 1 },
    }),
    prisma.business.upsert({
      where: { code: "consulting" },
      update: {},
      create: { name: "コンサルティング事業", code: "consulting", description: "経営・DXコンサルティング", managerId: manager.id, colorCode: "#10B981", sortOrder: 2 },
    }),
    prisma.business.upsert({
      where: { code: "web" },
      update: {},
      create: { name: "Web制作事業", code: "web", description: "Webサイト・LPの企画制作", managerId: manager.id, colorCode: "#8B5CF6", sortOrder: 3 },
    }),
    prisma.business.upsert({
      where: { code: "seo" },
      update: {},
      create: { name: "SEO事業", code: "seo", description: "SEO対策・コンテンツマーケティング", managerId: member.id, colorCode: "#F59E0B", sortOrder: 4 },
    }),
    prisma.business.upsert({
      where: { code: "system" },
      update: {},
      create: { name: "システム開発事業", code: "system", description: "業務システム・アプリ開発", managerId: admin.id, colorCode: "#EF4444", sortOrder: 5 },
    }),
  ]);
  console.log(`✅ 事業 ${businesses.length}件 作成`);

  // カスタムフィールド定義
  await Promise.all([
    prisma.customFieldDef.upsert({
      where: { businessId_fieldKey: { businessId: businesses[0].id, fieldKey: "ad_budget" } },
      update: {},
      create: { businessId: businesses[0].id, fieldKey: "ad_budget", fieldLabel: "広告予算（月額）", fieldType: "NUMBER", isRequired: true, sortOrder: 1 },
    }),
    prisma.customFieldDef.upsert({
      where: { businessId_fieldKey: { businessId: businesses[0].id, fieldKey: "ad_platform" } },
      update: {},
      create: { businessId: businesses[0].id, fieldKey: "ad_platform", fieldLabel: "運用媒体", fieldType: "SELECT", options: JSON.parse('["Google","Yahoo","Meta","TikTok","LINE"]'), isRequired: true, sortOrder: 2 },
    }),
    prisma.customFieldDef.upsert({
      where: { businessId_fieldKey: { businessId: businesses[0].id, fieldKey: "commission_rate" } },
      update: {},
      create: { businessId: businesses[0].id, fieldKey: "commission_rate", fieldLabel: "手数料率（%）", fieldType: "NUMBER", sortOrder: 3 },
    }),
    prisma.customFieldDef.upsert({
      where: { businessId_fieldKey: { businessId: businesses[1].id, fieldKey: "plan" } },
      update: {},
      create: { businessId: businesses[1].id, fieldKey: "plan", fieldLabel: "契約プラン", fieldType: "SELECT", options: JSON.parse('["ライト","スタンダード","プレミアム"]'), isRequired: true, sortOrder: 1 },
    }),
    prisma.customFieldDef.upsert({
      where: { businessId_fieldKey: { businessId: businesses[1].id, fieldKey: "mtg_count" } },
      update: {},
      create: { businessId: businesses[1].id, fieldKey: "mtg_count", fieldLabel: "月間MTG回数", fieldType: "NUMBER", sortOrder: 2 },
    }),
  ]);
  console.log("✅ カスタムフィールド定義 作成");

  // 顧客データ
  const customers = await Promise.all([
    prisma.customer.create({ data: { name: "株式会社サンプル", company: "株式会社サンプル", email: "info@sample.co.jp", phone: "03-1234-5678", representative: "山田太郎" } }),
    prisma.customer.create({ data: { name: "テスト商事", company: "テスト商事株式会社", email: "info@test-corp.co.jp", phone: "06-9876-5432", representative: "鈴木花子" } }),
    prisma.customer.create({ data: { name: "ABC Holdings", company: "ABC Holdings株式会社", email: "contact@abc-hd.co.jp", phone: "03-5555-1234", representative: "佐藤一郎" } }),
  ]);
  console.log(`✅ 顧客 ${customers.length}件 作成`);

  // 顧客×事業 紐付け
  const today = new Date();
  const threeDaysLater = new Date(today.getTime() + 3 * 86400000);
  const cbs = await Promise.all([
    prisma.customerBusiness.create({
      data: {
        customerId: customers[0].id, businessId: businesses[0].id,
        assigneeId: member.id, nextActionDate: threeDaysLater,
        customFields: { ad_budget: 500000, ad_platform: "Google", commission_rate: 20 },
        monthlyFee: 100000,
      },
    }),
    prisma.customerBusiness.create({
      data: {
        customerId: customers[0].id, businessId: businesses[1].id,
        assigneeId: manager.id, nextActionDate: today,
        customFields: { plan: "スタンダード", mtg_count: 2 },
        monthlyFee: 300000,
      },
    }),
    prisma.customerBusiness.create({
      data: {
        customerId: customers[1].id, businessId: businesses[0].id,
        assigneeId: member.id,
        // nextActionDate intentionally null for testing dashboard alert
        customFields: { ad_budget: 1000000, ad_platform: "Meta", commission_rate: 15 },
        monthlyFee: 150000,
      },
    }),
    prisma.customerBusiness.create({
      data: {
        customerId: customers[2].id, businessId: businesses[2].id,
        assigneeId: manager.id, nextActionDate: new Date(today.getTime() - 2 * 86400000),
        monthlyFee: 500000,
      },
    }),
  ]);
  console.log(`✅ 顧客×事業 ${cbs.length}件 作成`);

  // パートナーデータ
  const partner = await prisma.partner.create({
    data: {
      name: "フリーランス太郎",
      email: "freelance@example.com",
      company: "個人事業主",
      specialty: "広告運用",
      bankName: "三菱UFJ銀行",
      bankBranch: "渋谷支店",
      bankAccountType: "ORDINARY",
      bankAccountNumber: "1234567",
      bankAccountHolder: "フリーランス タロウ",
      contractType: "MONTHLY",
      rate: 400000,
    },
  });
  await prisma.partnerBusiness.create({
    data: { partnerId: partner.id, businessId: businesses[0].id, role: "広告運用担当" },
  });
  console.log("✅ パートナー 1件 作成");

  // 業務フローテンプレート
  const template = await prisma.workflowTemplate.create({
    data: {
      name: "新規広告運用 開始フロー",
      businessId: businesses[0].id,
      description: "新規クライアントの広告運用開始時の標準フロー",
      steps: {
        create: [
          { title: "ヒアリングシート送付", sortOrder: 1, daysFromStart: 0, daysFromPrevious: 0, isRequired: true },
          { title: "ヒアリング実施", sortOrder: 2, daysFromPrevious: 3, isRequired: true },
          { title: "広告アカウント開設", sortOrder: 3, daysFromPrevious: 1, isRequired: true },
          { title: "広告設定・入稿", sortOrder: 4, daysFromPrevious: 5, isRequired: true },
          { title: "初回レポート作成", sortOrder: 5, daysFromPrevious: 14, isRequired: true },
          { title: "次回対応日を設定", sortOrder: 6, daysFromPrevious: 0, isRequired: true },
        ],
      },
    },
  });
  console.log("✅ フローテンプレート 1件 作成");

  // サンプル実行中フロー
  const workflow = await prisma.workflow.create({
    data: {
      templateId: template.id,
      customerBusinessId: cbs[0].id,
      status: "ACTIVE",
    },
  });
  const stepDates = [
    new Date(today.getTime() - 10 * 86400000),
    new Date(today.getTime() - 7 * 86400000),
    new Date(today.getTime() - 6 * 86400000),
    new Date(today.getTime() - 1 * 86400000),
    new Date(today.getTime() + 13 * 86400000),
    new Date(today.getTime() + 13 * 86400000),
  ];
  await Promise.all([
    prisma.workflowStep.create({ data: { workflowId: workflow.id, title: "ヒアリングシート送付", status: "DONE", assigneeId: member.id, dueDate: stepDates[0], completedAt: stepDates[0], sortOrder: 1 } }),
    prisma.workflowStep.create({ data: { workflowId: workflow.id, title: "ヒアリング実施", status: "DONE", assigneeId: member.id, dueDate: stepDates[1], completedAt: stepDates[1], sortOrder: 2 } }),
    prisma.workflowStep.create({ data: { workflowId: workflow.id, title: "広告アカウント開設", status: "DONE", assigneeId: member.id, dueDate: stepDates[2], completedAt: stepDates[2], sortOrder: 3 } }),
    prisma.workflowStep.create({ data: { workflowId: workflow.id, title: "広告設定・入稿", status: "ACTIVE", assigneeId: member.id, dueDate: stepDates[3], sortOrder: 4 } }),
    prisma.workflowStep.create({ data: { workflowId: workflow.id, title: "初回レポート作成", status: "PENDING", assigneeId: member.id, dueDate: stepDates[4], sortOrder: 5 } }),
    prisma.workflowStep.create({ data: { workflowId: workflow.id, title: "次回対応日を設定", status: "PENDING", assigneeId: member.id, dueDate: stepDates[5], sortOrder: 6 } }),
  ]);
  console.log("✅ サンプルフロー + ステップ 作成");

  // サンプルタスク
  await Promise.all([
    prisma.task.create({ data: { title: "A社 請求書送付", assigneeId: member.id, dueDate: today, priority: "HIGH", customerBusinessId: cbs[0].id, businessId: businesses[0].id } }),
    prisma.task.create({ data: { title: "月次レポート作成", assigneeId: manager.id, dueDate: threeDaysLater, priority: "MEDIUM", businessId: businesses[0].id } }),
    prisma.task.create({ data: { title: "B社 契約更新確認", assigneeId: manager.id, dueDate: new Date(today.getTime() - 1 * 86400000), priority: "URGENT", customerBusinessId: cbs[3].id, businessId: businesses[2].id } }),
  ]);
  console.log("✅ サンプルタスク 3件 作成");

  // サンプル支払い
  await prisma.payment.create({
    data: {
      partnerId: partner.id,
      businessId: businesses[0].id,
      amount: 400000,
      tax: 40000,
      totalAmount: 440000,
      type: "SALARY",
      status: "PENDING",
      period: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`,
      dueDate: new Date(today.getFullYear(), today.getMonth() + 1, 0),
    },
  });
  console.log("✅ サンプル支払い 1件 作成");

  // タグ
  await Promise.all([
    prisma.tag.upsert({ where: { name_category: { name: "VIP", category: "CUSTOMER" } }, update: {}, create: { name: "VIP", color: "#EF4444", category: "CUSTOMER" } }),
    prisma.tag.upsert({ where: { name_category: { name: "新規", category: "CUSTOMER" } }, update: {}, create: { name: "新規", color: "#10B981", category: "CUSTOMER" } }),
    prisma.tag.upsert({ where: { name_category: { name: "要注意", category: "CUSTOMER" } }, update: {}, create: { name: "要注意", color: "#F59E0B", category: "CUSTOMER" } }),
    prisma.tag.upsert({ where: { name_category: { name: "緊急", category: "TASK" } }, update: {}, create: { name: "緊急", color: "#EF4444", category: "TASK" } }),
  ]);
  console.log("✅ タグ 4件 作成");

  // 通知設定
  await prisma.notificationSetting.upsert({
    where: { userId: admin.id },
    update: {},
    create: { userId: admin.id, alertDaysBefore: 3, showAllBusinesses: true },
  });
  await prisma.notificationSetting.upsert({
    where: { userId: member.id },
    update: {},
    create: { userId: member.id, alertDaysBefore: 3 },
  });
  console.log("✅ 通知設定 作成");

  // ============================================================
  // 経費カテゴリ (7大分類 + 小分類)
  // ============================================================
  const categoryData: { name: string; children: string[] }[] = [
    { name: "人件費", children: ["給与・報酬", "業務委託費", "社会保険料"] },
    { name: "広告・販促費", children: ["Web広告", "制作費", "イベント費"] },
    { name: "IT・システム費", children: ["SaaS利用料", "サーバー・インフラ", "開発・保守費"] },
    { name: "オフィス・管理費", children: ["家賃・光熱費", "通信費", "備品・消耗品"] },
    { name: "その他", children: ["交通費・出張費", "交際費", "雑費"] },
  ];

  for (let i = 0; i < categoryData.length; i++) {
    const cat = categoryData[i];
    let parent = await prisma.expenseCategory.findFirst({ where: { name: cat.name, parentId: null } });
    if (!parent) {
      parent = await prisma.expenseCategory.create({ data: { name: cat.name, parentId: null, sortOrder: i + 1, budgetTarget: true } });
    }
    for (let j = 0; j < cat.children.length; j++) {
      const exists = await prisma.expenseCategory.findFirst({ where: { name: cat.children[j], parentId: parent.id } });
      if (!exists) {
        await prisma.expenseCategory.create({ data: { name: cat.children[j], parentId: parent.id, sortOrder: j + 1, budgetTarget: true } });
      }
    }
  }
  console.log(`✅ 経費カテゴリ ${categoryData.length}大分類 + ${categoryData.reduce((s, c) => s + c.children.length, 0)}小分類 作成`);

  // 承認ルール
  const rules = [
    { name: "10万円未満: 自動承認", minAmount: 0, maxAmount: 100000, requiredRole: Role.MEMBER, autoApprove: true, sortOrder: 1 },
    { name: "10万〜100万: マネージャー承認", minAmount: 100000, maxAmount: 1000000, requiredRole: Role.MANAGER, autoApprove: false, sortOrder: 2 },
    { name: "100万円以上: 管理者承認", minAmount: 1000000, maxAmount: null, requiredRole: Role.ADMIN, autoApprove: false, sortOrder: 3 },
  ];
  for (const rule of rules) {
    await prisma.approvalRule.create({ data: rule });
  }
  console.log(`✅ 承認ルール ${rules.length}件 作成`);

  console.log("\n🎉 シードデータ投入完了！");
  console.log("ログイン情報:");
  console.log("  管理者: admin@example.com / admin123");
  console.log("  マネージャー: manager@example.com / manager123");
  console.log("  メンバー: member@example.com / member123");
}

main()
  .catch((e) => {
    console.error("❌ シードエラー:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
