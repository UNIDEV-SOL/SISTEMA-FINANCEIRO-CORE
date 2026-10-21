import type { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import { parsePage } from "../../shared/http/pagination";
import { idParamSchema } from "../../shared/http/schemas";
import {
  ARTICLE_SORTS,
  articleInputSchema,
  FAQ_SORTS,
  faqInputSchema,
  helpFiltersSchema,
  publishedInputSchema,
  reorderInputSchema,
  searchQuerySchema,
  slugParamSchema,
} from "./help.schemas";
import { helpService } from "./help.service";

export const helpController = {
  async articles(_req: Request, res: Response) {
    res.json(await helpService.publishedArticles());
  },

  async article(req: Request, res: Response) {
    const { slug } = slugParamSchema.parse(req.params);
    res.json(await helpService.publishedArticle(slug));
  },

  async faqs(_req: Request, res: Response) {
    res.json(await helpService.publishedFaqs());
  },

  async search(req: Request, res: Response) {
    const { q, limit } = searchQuerySchema.parse(req.query);
    res.json(await helpService.search(q, limit));
  },
};

export const adminHelpController = {
  async listArticles(req: Request, res: Response) {
    const filters = helpFiltersSchema.parse(req.query);
    const page = await parsePage(req.query, ARTICLE_SORTS);
    res.json(await helpService.listArticles(page, filters));
  },

  async getArticle(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await helpService.getArticle(id));
  },

  async createArticle(req: Request, res: Response) {
    const input = articleInputSchema.parse(req.body);
    res.status(StatusCodes.CREATED).json(await helpService.createArticle(input));
  },

  async updateArticle(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const input = articleInputSchema.parse(req.body);
    res.json(await helpService.updateArticle(id, input));
  },

  async publishArticle(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const { published } = publishedInputSchema.parse(req.body);
    res.json(await helpService.setArticlePublished(id, published));
  },

  async removeArticle(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    await helpService.removeArticle(id);
    res.status(StatusCodes.NO_CONTENT).end();
  },

  async reorderArticles(req: Request, res: Response) {
    res.json(await helpService.reorderArticles(reorderInputSchema.parse(req.body)));
  },

  async listFaqs(req: Request, res: Response) {
    const filters = helpFiltersSchema.parse(req.query);
    const page = await parsePage(req.query, FAQ_SORTS);
    res.json(await helpService.listFaqs(page, filters));
  },

  async getFaq(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    res.json(await helpService.getFaq(id));
  },

  async createFaq(req: Request, res: Response) {
    const input = faqInputSchema.parse(req.body);
    res.status(StatusCodes.CREATED).json(await helpService.createFaq(input));
  },

  async updateFaq(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const input = faqInputSchema.parse(req.body);
    res.json(await helpService.updateFaq(id, input));
  },

  async publishFaq(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    const { published } = publishedInputSchema.parse(req.body);
    res.json(await helpService.setFaqPublished(id, published));
  },

  async removeFaq(req: Request, res: Response) {
    const { id } = idParamSchema.parse(req.params);
    await helpService.removeFaq(id);
    res.status(StatusCodes.NO_CONTENT).end();
  },

  async reorderFaqs(req: Request, res: Response) {
    res.json(await helpService.reorderFaqs(reorderInputSchema.parse(req.body)));
  },
};
