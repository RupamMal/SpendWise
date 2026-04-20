import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function analyzeExpenseScreenshot(base64Image: string, mimeType: string) {
  const model = "gemini-3.1-pro-preview";
  
  const prompt = `Analyze this payment screenshot (UPI, Bank statement, list of transactions, etc.).
  The screenshot may contain one or MANY transactions. 
  For EACH identifiable transaction:
  1. Identify if it's a credit (money received) or debit (money spent).
  2. Extract the transaction amount.
  3. Categorize it (e.g., Food, Shopping, Groceries, Rent, Salary, Transfer, Utilities, Entertainment, Health, Other).
  4. Provide a short meaningful description (who the payment was to or from).
  
  Return ALL found transactions as a list.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { data: base64Image, mimeType } }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transactions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  amount: { type: Type.NUMBER, description: "The transaction amount" },
                  type: { type: Type.STRING, enum: ["credit", "debit"], description: "Money in or out" },
                  category: { type: Type.STRING, description: "Transaction category" },
                  description: { type: Type.STRING, description: "Short summary of the transaction" }
                },
                required: ["amount", "type", "category", "description"]
              }
            }
          },
          required: ["transactions"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    const parsed = JSON.parse(text);
    return parsed.transactions;
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    throw error;
  }
}

export async function generateMonthlyReport(transactions: any[], monthlyLimit: number, initialBalance: number) {
  const model = "gemini-3-flash-preview";
  
  const summary = transactions.map(t => `${t.date}: ${t.type} ${t.amount} [${t.category}] - ${t.description}`).join('\n');
  
  const prompt = `Review the following transaction list for the month. 
  Monthly Limit: ${monthlyLimit}
  Starting Balance: ${initialBalance}
  
  Provide a concise summary of spending habits, key categories where money was spent, and 3 actionable tips to stay within the limit.
  
  Transactions:
  ${summary}`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: prompt }] }]
    });
    return response.text;
  } catch (error) {
    console.error("Report generation failed:", error);
    return "Could not generate report at this time.";
  }
}
