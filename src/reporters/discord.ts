type DiscordOptions = {
  webhookUrl?: string
  dryRun?: boolean
}

function splitDiscordMessage(content: string) {
  const chunks: string[] = []
  let rest = content
  while (rest.length > 1900) {
    let splitAt = rest.lastIndexOf('\n', 1900)
    if (splitAt < 500) splitAt = 1900
    chunks.push(rest.slice(0, splitAt))
    rest = rest.slice(splitAt).trimStart()
  }
  if (rest) chunks.push(rest)
  return chunks
}

export async function sendDiscordReport(
  content: string,
  options: DiscordOptions
) {
  if (options.dryRun || !options.webhookUrl) {
    console.log(content)
    return
  }

  const chunks = splitDiscordMessage(content)
  for (let index = 0; index < chunks.length; index += 1) {
    const response = await fetch(options.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content:
          chunks.length > 1
            ? `${chunks[index]}\n\n(${index + 1}/${chunks.length})`
            : chunks[index],
        allowed_mentions: { parse: [] },
      }),
    })
    if (!response.ok) {
      const text = await response.text()
      throw new Error(
        `Discord webhook failed: ${response.status} ${text.slice(0, 300)}`
      )
    }
  }
}
