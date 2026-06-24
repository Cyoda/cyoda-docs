import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import rehypeMermaid from 'rehype-mermaid';
import cookieconsent from '@jop-software/astro-cookieconsent';
import react from '@astrojs/react';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// https://astro.build/config
export default defineConfig({
	// Site URL for sitemap generation - use environment variable for flexible deployment
	site: process.env.SITE_URL || 'https://docs.cyoda.net',
	// Base path for deployment (useful for subdirectory deployments)
	base: process.env.BASE_PATH || '/',
	// Performance optimizations
	output: 'static',
	build: {
		inlineStylesheets: 'always', // Inline critical CSS for better performance
		assets: '_astro'
	},
	prefetch: {
		prefetchAll: false,
		defaultStrategy: 'hover'
	},

	vite: {
		build: {
			cssCodeSplit: true,
			target: 'es2022', // Modern browsers for better tree-shaking
			rollupOptions: {
				treeshake: {
					preset: 'recommended'
					// Do NOT set moduleSideEffects: false here. It strips
					// CSS-only side-effect imports (e.g. Starlight's
					// `import '../style/anchor-links.css'` in Page.astro
					// via virtual:starlight/optional-css), producing
					// broken rendering for heading anchor links and
					// other styled Starlight features.
				}
			},
			// Optimize CSS delivery
			cssMinify: true,
			minify: 'esbuild'
		},
		optimizeDeps: {
			// Removed API reference libraries to allow dynamic imports
		},
		// CSS optimization
		css: {
			devSourcemap: false
		}
	},
	markdown: {
		rehypePlugins: [
			[rehypeMermaid, {
				strategy: 'img-svg',
				dark: true,
				colorScheme: 'default'
			}]
		]
	},
	redirects: {
		'/getting-started/introduction/': '/concepts/what-is-cyoda/',
		'/getting-started/quickstart/': '/getting-started/install-and-first-entity/',
		'/guides/cyoda-design-principles/': '/concepts/design-principles/',
		'/guides/api-saving-and-getting-data/': '/build/working-with-entities/',
		'/guides/authentication-authorization/': '/concepts/authentication-and-identity/',
		'/guides/iam-jwt-keys-and-oidc/': '/cyoda-cloud/identity-and-entitlements/',
		'/guides/iam-oidc-and-jwt-claims/': '/cyoda-cloud/identity-and-entitlements/',
		'/guides/workflow-config-guide/': '/build/workflows-and-processors/',
		'/guides/client-calculation-member-guide/': '/build/client-compute-nodes/',
		'/guides/entity-model-simple-view-specification/': '/reference/entity-model-export/',
		'/guides/sql-and-trino/': '/reference/trino/',
		'/guides/provision-environment/': '/cyoda-cloud/provisioning/',
		'/architecture/cyoda-cloud-architecture/': '/cyoda-cloud/',
		'/cloud/entitlements/': '/cyoda-cloud/identity-and-entitlements/',
		'/cloud/roadmap/': '/cyoda-cloud/status-and-roadmap/',
		'/cloud/service-details/': '/cyoda-cloud/',
		'/cloud/status/': '/cyoda-cloud/status-and-roadmap/',
		'/reference/cyoda-help/': '/help/topic-tree/',
	},
	integrations: [
		react(),
		cookieconsent({
			cookie: {
				useLocalStorage: true,
			},
			guiOptions: {
				consentModal: {
					layout: 'cloud',
					position: 'bottom center',
					equalWeightButtons: true,
					flipButtons: false,
				},
				preferencesModal: {
					layout: 'box',
					position: 'right',
					equalWeightButtons: true,
					flipButtons: false,
				},
			},
			categories: {
				necessary: {
					enabled: true,
					readOnly: true,
				},
				analytics: {
					enabled: false,
					readOnly: false,
					autoClear: {
						cookies: [
							{
								name: '_ga',
							},
							{
								name: '_ga_*',
							},
							{
								name: '_gid',
							},
						],
					},
					services: {
						ga4: {
							label: 'Google Analytics 4',
							onAccept: () => {
								// Initialize Google Analytics when consent is given
								if (typeof window !== 'undefined') {
									window.gtag('consent', 'update', {
										analytics_storage: 'granted'
									});
								}
							},
							onReject: () => {
								// Disable Google Analytics when consent is rejected
								if (typeof window !== 'undefined') {
									window.gtag('consent', 'update', {
										analytics_storage: 'denied'
									});
								}
							},
						},
					},
				},
			},
			language: {
				default: 'en',
				translations: {
					en: {
						consentModal: {
							title: 'Cookie Consent',
							description: 'Our website uses cookies and other related technologies ' +
                                '(for convenience all technologies are referred to as "cookies"). ' +
                                'Some cookies ensure that certain parts of the website work properly and that ' +
                                'your user preferences remain known (Essential cookies). We also place cookies for ' +
                                'analytics to measure usage and improve your experience, and marketing cookies to ' +
                                'create user profiles and display personalized advertising. ' +
                                'By clicking "Accept All", you consent to us using all categories of cookies as ' +
                                'described in our Cookie Policy. You can disable the use of cookies via your browser, ' +
                                'but please note that our website may no longer work properly. ' +
                                'See our <a href="/cookies" target="_blank">Cookie Policy</a> and ' +
                                '<a href="/privacy" target="_blank">Privacy Policy</a>.',
							acceptAllBtn: 'Accept All',
							acceptNecessaryBtn: 'Accept Necessary Only',
							showPreferencesBtn: 'Manage Preferences',
						},
						preferencesModal: {
							title: 'Cookie Preferences',
							acceptAllBtn: 'Accept All',
							acceptNecessaryBtn: 'Accept Necessary Only',
							savePreferencesBtn: 'Save Preferences',
							closeIconLabel: 'Close',
							sections: [
								{
									title: 'Cookie Usage',
									description: 'We use cookies to ensure the basic functionalities of the website ' +
                                        'and to enhance your online experience. You can choose for each category to ' +
                                        'opt-in/out whenever you want. See our <a href="/cookies" target="_blank">Cookie Policy</a> and ' +
                                        '<a href="/privacy" target="_blank">Privacy Policy</a>.',
								},
								{
									title: 'Strictly Necessary Cookies. Always On.',
									description: 'These are necessary for the website to function properly.' +
                                        'Essential cookies are required for basic site functionality and security. ' +
                                        'These are always on and rely on our legitimate interests and are exempt from ' +
                                        'consent requirements under applicable law.',
									linkedCategory: 'necessary',
								},
								{
									title: 'Analytics Cookies',
									description: 'These cookies allow us to analyze website usage and improve our ' +
                                        'services. We use Google Analytics with privacy-enhanced settings.',
									linkedCategory: 'analytics',
								},
							],
						},
					},
				},
			},
		}),
		starlight({
			title: 'Cyoda Documentation',
			description: 'Documentation for the Cyoda platform - event-driven architecture and data management solutions.',
			// Configure Pagefind search to work with different deployment URLs
			pagefind: {
				forceLanguage: 'en',
			},

            social: [
                {
                    icon: 'github',
                    label: 'GitHub',
                    href: 'https://github.com/Cyoda-platform/cyoda-docs'
                },
                {
                    icon: 'linkedin',
                    label: 'LinkedIn',
                    href: 'https://linkedin.com/company/cyoda'
                },
                {
                    icon: 'discord',
                    label: 'Discord',
                    href: 'https://discord.com/invite/95rdAyBZr2'
                },
                {
                    icon: 'youtube',
                    label: 'YouTube',
                    href: 'https://www.youtube.com/@cyoda934'
                }
            ],			head: [
				// Async load non-critical CSS for better performance
				{
					tag: 'link',
					attrs: {
						rel: 'preload',
						href: '/styles/non-critical.css',
						as: 'style',
						onload: "this.onload=null;this.rel='stylesheet'"
					}
				},
				{
					tag: 'noscript',
					content: '<link rel="stylesheet" href="/styles/non-critical.css">'
				},
				// Google Analytics is now handled by the Analytics component
				// for better performance and conditional loading
			],
			customCss: [
				// Design tokens - source of truth for palette + typography (load first)
				'./src/styles/tokens.css',
				// Critical CSS - inlined for immediate rendering
				'./src/styles/critical.css',
				// Primer primitives with Cyoda branding - optimized loading
				'./src/styles/primer.css',
				// Custom styles for components
				'./src/styles/custom.css',
				// Visual look-and-feel utilities (dotted-grid bg, hero/separator/card helpers) — load last so utilities can layer on top
				'./src/styles/visual.css',
				// Non-critical CSS removed from bundle - loaded async from public directory
			],
			sidebar: [
				{
					label: 'Getting Started',
					collapsed: false,
					autogenerate: { directory: 'getting-started' }
				},
				{
					label: 'Concepts',
					collapsed: true,
					autogenerate: { directory: 'concepts' }
				},
				{
					label: 'Build',
					collapsed: true,
					autogenerate: { directory: 'build' }
				},
				{
					label: 'Run',
					collapsed: true,
					autogenerate: { directory: 'run' }
				},
				{
					label: 'Cyoda Cloud',
					collapsed: true,
					autogenerate: { directory: 'cyoda-cloud' }
				},
				{
					label: 'Help',
					collapsed: true,
					items: [
						{ label: 'cmd line', link: '/help/topic-tree/' },
						{ label: 'browse', link: '/help/' },
					],
				},
				{
					label: 'Reference',
					collapsed: true,
					autogenerate: { directory: 'reference' }
				},
				{
					label: 'Releases',
					collapsed: true,
					autogenerate: { directory: 'releases' }
				},
			],
			components: {
				// Override the default head component to include Analytics
				Head: './src/components/Head.astro',
				// Override the default footer component
				Footer: './src/components/Footer.astro',
				// Override the default header component to add navigation
				Header: './src/components/Header.astro',
				// Override the default site title to add logo and aqua coloring
				SiteTitle: './src/components/SiteTitle.astro',
				// Override the table of contents to add copy page button
				TableOfContents: './src/components/TableOfContents.astro',
			},
		}),
	],
});
