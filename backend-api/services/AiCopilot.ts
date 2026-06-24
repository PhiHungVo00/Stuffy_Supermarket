import { OpenAI } from 'openai';
import Product from '../models/Product';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'AI_KEY_DEMO' });

/**
 * AGENTIC AI SHOPPING COPILOT
 * 
 * This engine uses OpenAI Tool Calling to interact with the database 
 * and act as a personal shopper for the user.
 */

// 1. Tool (Function) Definitions for the AI
const tools: any[] = [
  {
    type: "function",
    function: {
      name: "search_and_filter_products",
      description: "Search products by keyword and price range.",
      parameters: {
        type: "object",
        properties: {
          keyword: { type: "string" },
          minPrice: { type: "number" },
          maxPrice: { type: "number" },
          category: { type: "string" }
        },
        required: ["keyword"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "create_gift_bundle",
      description: "Find a group of products that fit a gift theme and budget.",
      parameters: {
        type: "object",
        properties: {
          theme: { type: "string", description: "e.g. 'Tech Gamer', 'Cozy Home', 'Chef'" },
          budget: { type: "number" }
        },
        required: ["theme", "budget"]
      }
    }
  }
];

export class AiCopilot {
  static async handleChat(query: string, tenantId: string = 'default_store') {
    // 🔒 SECURITY FIX: Prevent ReDoS
    const escapeRegex = (text: string) => {
      return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    };

    console.log(`[AI Copilot] Processing query: "${query}" for tenant: ${tenantId}`);

    // System Prompt: Set the personality of the Agent
    const messages: any[] = [
      { 
        role: "system", 
        content: "You are the Stuffy Supermarket AI Shopping Assistant. You help users find products, suggest gift bundles, and explain tech specs. Format prices as '$X'. Be concise and friendly." 
      },
      { role: "user", content: query }
    ];

    // Initial Request to OpenAI: Determine Intent and Tools
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages,
      tools,
      tool_choice: "auto",
    });

    const responseMessage = response.choices[0].message;

    // 🎯 If the AI wants to call a tool (Function Calling)
    if (responseMessage.tool_calls) {
      const toolCall = responseMessage.tool_calls[0];
      const functionName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);

      let result: any = null;

      // Tool 1: Real-time Database Search
      if (functionName === "search_and_filter_products") {
        result = await Product.find({
          tenantId,
          name: { $regex: escapeRegex(args.keyword || ''), $options: 'i' },
          price: { $gte: args.minPrice || 0, $lte: args.maxPrice || 99999 }
        }).limit(5);
      } 
      // Tool 2: Gift Bundle Logic (AI-driven aggregation)
      else if (functionName === "create_gift_bundle") {
          result = await Product.find({
              tenantId,
              $or: [
                  { category: { $regex: escapeRegex(args.theme || ''), $options: 'i' } },
                  { name: { $regex: escapeRegex(args.theme || ''), $options: 'i' } }
              ],
              price: { $lte: args.budget }
          }).limit(3);
      }

      // Final reasoning to User
      const finalResponse = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          ...messages,
          responseMessage,
          {
            tool_call_id: toolCall.id,
            role: "tool",
            name: functionName,
            content: JSON.stringify(result),
          }
        ],
      });

      return {
        answer: finalResponse.choices[0].message.content,
        suggestedProducts: result,
        toolUsed: functionName
      };
    }

    // Default: Regular chat conversation
    return {
      answer: responseMessage.content,
      suggestedProducts: [],
      toolUsed: "none"
    };
  }
}
