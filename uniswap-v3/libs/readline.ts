import * as readline from 'readline';

export const getStdInput = async (question: string, rl: readline.Interface): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(question, (answer: string) => {
      resolve(answer);
    });
  });
}
