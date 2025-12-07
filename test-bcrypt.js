const bcrypt = require('bcryptjs');

async function test() {
  const password = 'мойпароль123';
  const hash = await bcrypt.hash(password, 10);
  console.log('Хеш:', hash);
  
  const match = await bcrypt.compare('мойпароль123', hash);
  console.log('Пароль совпадает?', match);
}

test();
