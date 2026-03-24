import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Body,
  Query,
  Res,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { GithubAppService } from './github-app.service';
import { ConfigService } from '@nestjs/config';

@Controller('github')
export class GithubAppController {
  private readonly logger = new Logger(GithubAppController.name);

  constructor(
    private readonly githubApp: GithubAppService,
    private readonly config: ConfigService,
  ) {}

  /** Check if GitHub App integration is configured */
  @Get('status')
  @UseGuards(AuthGuard('jwt'))
  getStatus() {
    return {
      configured: this.githubApp.isConfigured(),
      installUrl: this.githubApp.getInstallUrl(),
    };
  }

  /** Redirect user to install the GitHub App */
  @Get('install')
  @UseGuards(AuthGuard('jwt'))
  installRedirect(@Res() res: Response) {
    const url = this.githubApp.getInstallUrl();
    if (!url) {
      return res.status(400).json({ message: 'GitHub App not configured' });
    }
    return res.redirect(url);
  }

  /** Handle GitHub App installation callback */
  @Get('callback')
  async handleCallback(
    @Query('installation_id') installationIdStr: string,
    @Query('setup_action') setupAction: string,
    @Res() res: Response,
  ) {
    const installationId = parseInt(installationIdStr, 10);
    if (isNaN(installationId)) {
      return res.status(400).json({ message: 'Invalid installation_id' });
    }

    try {
      await this.githubApp.handleInstallationCallback(installationId);
      this.logger.log(
        `GitHub App installed: installationId=${installationId}, action=${setupAction}`,
      );
    } catch (err) {
      this.logger.error(
        `GitHub callback failed: ${(err as Error).message}`,
      );
      const frontendUrl =
        this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
      return res.redirect(`${frontendUrl}/settings?github_error=install_failed`);
    }

    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    return res.redirect(`${frontendUrl}/settings?github=connected`);
  }

  /** List active installations */
  @Get('installations')
  @UseGuards(AuthGuard('jwt'))
  listInstallations() {
    return this.githubApp.listInstallations();
  }

  /** Disconnect an installation */
  @Delete('installations/:id')
  @UseGuards(AuthGuard('jwt'))
  disconnectInstallation(@Param('id') id: string) {
    return this.githubApp.disconnectInstallation(id);
  }

  /** List repos accessible via GitHub */
  @Get('repos')
  @UseGuards(AuthGuard('jwt'))
  listRepos() {
    return this.githubApp.listAccessibleRepos();
  }

  /** List granted (enabled) repos */
  @Get('repos/granted')
  @UseGuards(AuthGuard('jwt'))
  listGrantedRepos() {
    return this.githubApp.listGrantedRepos();
  }

  /** Enable a repo for tracking */
  @Post('repos/grant')
  @UseGuards(AuthGuard('jwt'))
  grantRepo(
    @Body() body: { installationId: string; repoFullName: string },
  ) {
    return this.githubApp.grantRepo(body.installationId, body.repoFullName);
  }

  /** Disable a repo from tracking */
  @Delete('repos/grant/:id')
  @UseGuards(AuthGuard('jwt'))
  revokeRepoGrant(@Param('id') id: string) {
    return this.githubApp.revokeRepoGrant(id);
  }
}
