export async function loginAndGetToken(page, config) {
  const result = await page.evaluate(async (config) => {
    const response = await fetch(config.auth.loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Felix-Api-Version': '2',
        'X-Platform': 'web',
        'X-Felix-Path': '/login'
      },
      body: JSON.stringify({
        email: config.auth.email,
        password: config.auth.password
      })
    });
    return await response.json();
  }, config);

  return result.data.access_token;
} 