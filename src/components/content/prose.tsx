import { Fragment } from 'react';
import { Link } from 'react-router';
import { business } from '@/config/business';
import { textLinkClasses } from '@/design-system';
import type { Block, Inline } from '@/lib/content/types';

/** The configured support address, or a link to the contact page until one is configured. */
export function SupportEmail() {
  if (business.supportEmail) {
    return (
      <a href={`mailto:${business.supportEmail}`} className={textLinkClasses}>
        {business.supportEmail}
      </a>
    );
  }
  return (
    <Link to="/contact" className={textLinkClasses}>
      our support team
    </Link>
  );
}

export function InlineText({ runs }: { runs: Inline[] }) {
  return (
    <>
      {runs.map((run, index) => {
        if (run.type === 'support-email') return <SupportEmail key={index} />;
        const text = run.strong ? <strong className="font-semibold text-fg">{run.text}</strong> : run.text;
        if (!run.href) return <Fragment key={index}>{text}</Fragment>;
        const internal = run.href.startsWith('/') || run.href.startsWith('#');
        return internal ? (
          <Link key={index} to={run.href} className={textLinkClasses}>
            {text}
          </Link>
        ) : (
          <a key={index} href={run.href} className={textLinkClasses} target="_blank" rel="noreferrer">
            {text}
          </a>
        );
      })}
    </>
  );
}

/** Renders imported content blocks with the site's typography. */
export function ProseBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="flex flex-col gap-4 text-body text-fg">
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'p':
            return (
              <p key={index} className="text-fg-muted">
                <InlineText runs={block.content} />
              </p>
            );
          case 'h3':
            return (
              <h3 key={index} className="pt-2 text-h3 font-semibold text-fg">
                {block.text}
              </h3>
            );
          case 'ul':
          case 'ol': {
            const List = block.type;
            return (
              <List key={index} className={`flex flex-col gap-2 pl-5 text-fg-muted ${block.type === 'ul' ? 'list-disc' : 'list-decimal'} marker:text-fg-subtle`}>
                {block.items.map((item, i) => (
                  <li key={i}>
                    <InlineText runs={item} />
                  </li>
                ))}
              </List>
            );
          }
          case 'dl':
            return (
              <dl key={index} className="grid gap-x-6 gap-y-2 sm:grid-cols-[12rem_1fr]">
                {block.items.map((item) => (
                  <div key={item.term} className="contents">
                    <dt className="font-semibold text-fg">{item.term}</dt>
                    <dd className="text-fg-muted">
                      <InlineText runs={item.details} />
                    </dd>
                  </div>
                ))}
              </dl>
            );
          case 'table':
            return (
              // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard-reachable
              <section key={index} aria-label={block.head.join(' and ')} tabIndex={0} className="overflow-x-auto rounded-md border border-border">
                <table className="w-full min-w-[32rem] border-collapse text-left text-body-sm">
                  <thead className="bg-surface-subtle">
                    <tr>
                      {block.head.map((cell) => (
                        <th key={cell} scope="col" className="px-4 py-3 font-semibold text-fg">
                          {cell}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r} className="border-t border-border align-top">
                        {row.map((cell, c) =>
                          c === 0 ? (
                            <th key={c} scope="row" className="px-4 py-3 font-semibold text-fg">
                              <InlineText runs={cell} />
                            </th>
                          ) : (
                            <td key={c} className="px-4 py-3 text-fg-muted">
                              <InlineText runs={cell} />
                            </td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
