(function (root) {
  'use strict';
  const bills = [
    { id: 'electric', title: 'Електроенергія', icon: 'ϟ', provider: 'Демо Енергія', account: 'DEMO-E1042', amount: 64000, fee: 500 },
    { id: 'water', title: 'Водопостачання', icon: '◉', provider: 'Демо Вода', account: 'DEMO-W2084', amount: 28000, fee: 500 },
    { id: 'internet', title: 'Домашній інтернет', icon: '⌁', provider: 'Демо Мережа', account: 'DEMO-I3096', amount: 30000, fee: 0 }
  ];
  const products = [
    { id: 'headphones', title: 'Бездротові навушники', icon: '♬', amount: 120000, info: 'Bluetooth • до 20 годин роботи • гарантія 12 місяців' },
    { id: 'backpack', title: 'Міський рюкзак', icon: '▣', amount: 85000, info: '18 літрів • відділення для ноутбука • гарантія 6 місяців' },
    { id: 'speaker', title: 'Портативна колонка', icon: '◒', amount: 420000, info: '10 Вт • до 12 годин роботи • гарантія 12 місяців' }
  ];
  const questions = [
    { q: 'Магазин має HTTPS. Чи цього достатньо для довіри?', a: ['Так, це повна гарантія', 'Ні, треба перевірити продавця й умови'], correct: 1, why: 'HTTPS захищає з’єднання, але не доводить доброчесність продавця.' },
    { q: 'Що перевірити перед оплатою комунальних послуг?', a: ['Лише суму', 'Одержувача, особовий рахунок, період, суму й комісію'], correct: 1, why: 'Правильна сума не допоможе, якщо платіж піде іншому одержувачу.' },
    { q: 'Продавець просить повідомити код банку в чаті. Ваші дії?', a: ['Повідомлю, щоб отримати товар', 'Відмовлюся й припиню таку оплату'], correct: 1, why: 'Коди підтвердження не передають продавцю або співрозмовнику.' },
    { q: 'У підтвердженні інший одержувач або більша сума. Що робити?', a: ['Скасувати та перевірити замовлення', 'Підтвердити, а потім з’ясовувати'], correct: 0, why: 'Перед підтвердженням звіряють і суму, і одержувача.' },
    { q: 'Чим підтверджується покупка?', a: ['Лише скриншотом кошика', 'Підтвердженням замовлення та документами про оплату/покупку'], correct: 1, why: 'Банківська квитанція й розрахунковий документ продавця — різні документи. Зберігайте їх.' }
  ];
  const initial = () => ({ version: 1, balance: 500000, limit: 200000, transactions: [], security: false, quiz: null });
  function pay(state, order, code) {
    if (code !== '246810') throw Error('Неправильний навчальний код. Введіть 246810.');
    if (order.key !== order.type + '-' + order.id) throw Error('Неправильний ідентифікатор платежу.');
    if (state.transactions.some(t => t.key === order.key)) throw Error('Цей платіж уже виконано. Повторного списання немає.');
    let item, fee = 0, recipient, detail;
    if (order.type === 'bill') {
      item = bills.find(b => b.id === order.id);
      if (!item || order.account !== item.account) throw Error('Особовий рахунок не збігається з навчальною платіжкою.');
      fee = item.fee; recipient = item.provider; detail = item.account + ' • жовтень 2026';
    } else if (order.type === 'shop') {
      item = products.find(p => p.id === order.id);
      if (!item) throw Error('Товар не знайдено.');
      if (!['pickup','post'].includes(order.delivery)) throw Error('Оберіть спосіб доставки.');
      fee = order.delivery === 'pickup' ? 0 : 8000;
      recipient = 'Демо Маркет'; detail = fee ? 'Доставка: навчальне відділення №1' : 'Самовивіз: навчальний пункт №1';
    } else throw Error('Невідомий тип операції.');
    const total = item.amount + fee;
    if (total > state.balance) throw Error('Недостатньо коштів. Оберіть дешевший товар або скасуйте покупку.');
    if (order.type === 'shop' && total > state.limit) throw Error('Перевищено ліміт однієї інтернет-покупки. Змініть ліміт у розділі «Моя картка».');
    const transaction = { id: 'DEMO-' + (state.transactions.length + 1).toString().padStart(4, '0'), key: order.key, type: order.type, title: item.title, recipient, detail, amount: item.amount, fee, total, date: new Date().toISOString() };
    return { ...state, balance: state.balance - total, transactions: [...state.transactions, transaction] };
  }
  function score(s) {
    const utilities = bills.filter(b => s.transactions.some(t => t.key === 'bill-' + b.id)).length;
    const shop = s.transactions.some(t => t.type === 'shop') ? 3 : 0;
    const quiz = s.quiz ? s.quiz.reduce((n, a, i) => n + (a === questions[i].correct ? 1 : 0), 0) : 0;
    const reserve = utilities === 3 && shop && s.balance >= 100000 ? 1 : 0;
    return { utilities, shop, security: s.security ? 2 : 0, quiz, reserve, total: ((utilities + shop + (s.security ? 2 : 0) + reserve) * 10 + quiz * 6) / 10 };
  }
  function valid(s) {
    if (!s || s.version !== 1 || !Number.isInteger(s.balance) || s.balance < 0 || s.balance > 500000 || ![100000,200000,500000].includes(s.limit) || !Array.isArray(s.transactions) || typeof s.security !== 'boolean') return false;
    if (s.quiz !== null && (!Array.isArray(s.quiz) || s.quiz.length !== 5 || s.quiz.some(a => a !== 0 && a !== 1))) return false;
    const keys = new Set(); let sum = 0;
    for (const t of s.transactions) {
      if (!t || !Number.isInteger(t.total) || t.total <= 0 || typeof t.key !== 'string' || keys.has(t.key) || !Number.isFinite(Date.parse(t.date))) return false;
      keys.add(t.key); sum += t.total;
    }
    return s.balance === 500000 - sum;
  }
  const api = { bills, products, questions, initial, pay, score, valid };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Bank = api;
})(typeof window !== 'undefined' ? window : globalThis);
