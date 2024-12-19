import { openai } from "@ai-sdk/openai";
import { generateText, streamText, embed } from "ai";
import { DataAPIClient } from "@datastax/astra-db-ts";

const {
  ASTRA_DB_NAMESPACE,
  ASTRA_DB_COLLECTION,
  ASTRA_DB_API_ENDPOINT,
  ASTRA_DB_APPLICATION_TOKEN,
  OPEN_AI_KEY,
} = process.env;

// const openai = new OpenAI({
//   apiKey: OPEN_AI_KEY
// });

const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);
const db = client.db(ASTRA_DB_API_ENDPOINT, { namespace: ASTRA_DB_NAMESPACE });

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const latestMessage = messages[messages.length - 1]?.content;

    let docContext = "";

    const embedding = await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: latestMessage,
      maxRetries: 0, // Disable retries
      // encoding_format: "float",
    });
    
    try {
      const collection = db.collection(ASTRA_DB_COLLECTION);
      const cursor = collection.find(null, {
        sort: {
          $vector: embedding?.embedding,
        },
        limit: 10,
      });
      // console.log("check this Question embedding =====>", embedding?.embedding);

      const documents = await cursor.toArray();
      const docsMap = documents?.map((doc) => doc.text);
      // console.log("docsMap ==>", docsMap)

      docContext = JSON.stringify(docsMap);
    } catch (error) {
      console.log("Error querying db: ", error);
      docContext = "";
    }

    const template = {
      role: "assistant",
      content: `
      You are an AI assistant who knows everything about Chess World Championship.
      Use the below context to augment what you know about World Chess Championship.
      The context will provider you with the most recent page data from Wikipedia.
      If the context doesn't include the information you need, don't answer that question
      and don't mention the source of your information or what the context does or 
      doesn't include.
      Format responses using markdown where applicable and don't return images.
      ---------------
      START CONTEXT
      ${docContext}
      END CONTEXT
      ---------------
      QUESTION: ${latestMessage} 
      ---------------
      `,
    };
    // let fullResponse = "";
    // console.log("template ====>", template);

    // const stream = await openai.chat.completions.create({
    //   model: "gpt-4",
    //   stream: true,
    //   messages: [template, ...messages],
    // });

    // for await (const chunk of stream) {
    //   const content = chunk.choices[0]?.delta?.content || "";
    //   fullResponse += content;  // Accumulate the content
    // }
    // console.log("Check this ====>", fullResponse);

    // Send the full response once streaming is complete
    // return Response.json({ response: fullResponse });
    // return Response.json({
    //   content: fullResponse,

    // });
    // console.log("Check me forst =====>", messages);
    
    const result = streamText({
      model: openai("gpt-4"),
      system: `
      You are an AI assistant who knows everything about Chess World Championship.
      Use the below context to augment what you know about World Chess Championship.
      The context will provider you with the most recent page data from Wikipedia.
      If the context doesn't include the information you need, don't answer that question
      and don't mention the source of your information or what the context does or 
      doesn't include.
      Format responses using markdown where applicable and don't return images.
      ---------------
      START CONTEXT
      ${docContext}
      END CONTEXT
      ---------------
      QUESTION: ${latestMessage} 
      ---------------
      `,
      messages: [template, ...messages],
    });

    return result.toDataStreamResponse();
  } catch (err) {
    console.log("Error from api call =====>", err);
    throw err;
  }
}
