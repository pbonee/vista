# Generated by Django 3.1.4 on 2021-01-22 20:07

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('gsportal', '0008_indexdata_mktinfo'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='alertq',
            options={'ordering': ('created',), 'verbose_name': 'Alert Queue', 'verbose_name_plural': 'Alert Queue'},
        ),
        migrations.AlterModelOptions(
            name='indexdata',
            options={'verbose_name': 'Index Data', 'verbose_name_plural': 'Index Data'},
        ),
        migrations.AlterModelOptions(
            name='mktinfo',
            options={'verbose_name': 'Market Info', 'verbose_name_plural': 'Market Info'},
        ),
        migrations.AddField(
            model_name='indexdata',
            name='prevDJIclose',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=20, null=True),
        ),
        migrations.AddField(
            model_name='indexdata',
            name='prevGSPCclose',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=20, null=True),
        ),
        migrations.AddField(
            model_name='indexdata',
            name='prevIXICclose',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=20, null=True),
        ),
    ]
