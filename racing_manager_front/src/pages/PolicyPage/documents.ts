export type PolicyDocument = {
  slug: string;
  title: string;
  description: string;
  published: boolean;
};

export const policyDocuments: PolicyDocument[] = [
  {
    slug: 'privacy',
    title: 'Политика в отношении обработки персональных данных',
    description:
      'Кто оператор, какие данные обрабатываются, зачем, на каком основании, как долго и как ими управлять.',
    published: true,
  },
  {
    slug: 'cookies',
    title: 'Политика использования файлов cookie',
    description: 'Какие cookies применяются, для каких целей и как отозвать согласие.',
    published: true,
  },
  {
    slug: 'personal-data',
    title: 'Согласие на обработку персональных данных',
    description: 'Условия согласия субъекта персональных данных на обработку сведений.',
    published: true,
  },
  {
    slug: 'data-distribution',
    title: 'Согласие на распространение персональных данных',
    description: 'Условия публикации данных участников в стартовых и итоговых протоколах.',
    published: true,
  },
];

export function findPolicyDocument(slug: string | undefined) {
  return policyDocuments.find((document) => document.slug === slug);
}
